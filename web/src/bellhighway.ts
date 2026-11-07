// The bells' note highway (bells.ts): your part of the touch as a Guitar Hero chart, big in the
// middle of the screen. Four lanes, the notes coming down them to the line at the bottom, a chord's
// two notes joined by a bar, and the rest of the band's notes coming down faintly among yours; a lit
// ring where each lands, the word for how you struck it, your multiplier, score and streak down the
// sides, and over it all the band's striking: how near the whole thing is to collapsing. Under each
// lane is its key cap (keycap.ts), or on a touch screen a big pad to tap.
//
// Who decides what: nothing here. bells.ts says what's on it each frame; this only draws it.
import { input } from "./controls";
import { addStyle, layer } from "./hudkit";
import { keycaps } from "./keycap";

/** How far ahead a note shows, ms. */
export const AHEAD = 1800;

export interface Lane { ctl: string; colour: string; label: string }
/** A note: which lane (and pair, the second lane of a chord), ms till it's due at the line (less
 *  than nought once it's gone by), what's on it, whether you've struck it (1) or let it go by (2),
 *  and faint for someone else's, only there to show where yours fall among the band's. */
export interface Gem { lane: number; pair?: number; due: number; label: string; state: 0 | 1 | 2; faint?: boolean }
export interface HighwayFrame {
  title: string; right: string;
  /** The band's striking, 0..1: at nought the bells collapse. */
  meter: number;
  lanes: Lane[];
  gems: Gem[];
  /** Where each row starts, ms ahead; strong for a handstroke row. */
  bars: { due: number; strong: boolean }[];
  score: number; streak: number; mult: number;
  /** Words over the middle of the highway ("Look to…"). */
  centre?: string;
}

addStyle("bellhwy", `
#bellhwy{position:absolute;left:50%;bottom:max(2.5vh,calc(var(--sb,0px) + 8px));transform:translateX(-50%);width:min(600px,94vw);display:grid;justify-items:center;pointer-events:none;z-index:6}
#bellhwy[hidden]{display:none}
#bellhwy canvas{width:100%;height:min(54vh,480px);display:block}
#bellhwy .bh-caps{display:flex;margin-top:-2px;font-size:22px;font-weight:800;color:var(--ink)}
#bellhwy .bh-caps > *{flex:1;text-align:center;color:var(--lane)}
#bellhwy .bh-caps kbd.cap{min-width:1.6em;background:rgba(11,12,12,.6)}
#bellhwy .bh-pad{flex:1;width:auto;height:64px;margin:0 3px;border-radius:12px;border-color:var(--lane);color:var(--ink);
  background:color-mix(in srgb,var(--lane) 28%,rgba(11,12,12,.55));font-size:20px}
#bellhwy .bh-pad.on{background:var(--lane);color:var(--black)}
#hud:has(#bellhwy:not([hidden])) :is(.tcluster,#crosshair){display:none}
@media (max-height:520px){#bellhwy canvas{height:40vh}#bellhwy .bh-pad{height:54px}}`);

const pressGlow = 140;

export class Highway {
  private el = document.createElement("div");
  private cv = document.createElement("canvas");
  private caps = document.createElement("div");
  private capsFor = "";
  private held: boolean[] = [];
  private lit: number[] = [];
  private said: { lane: number; word: string; colour: string; t: number } | null = null;

  constructor(private onLane: (k: number, down: boolean) => void) {
    this.el.id = "bellhwy";
    this.el.hidden = true;
    this.caps.className = "bh-caps";
    this.el.append(this.cv, this.caps);
    layer().appendChild(this.el);
  }

  get shown() { return !this.el.hidden; }
  show(on: boolean) { if (this.el.hidden === on) this.el.hidden = !on; }

  /** A lane's key or pad held down, or let go. */
  press(k: number, on: boolean) { this.held[k] = on; if (on) this.lit[k] = performance.now(); }
  /** How a note in lane k was struck, in a word and a colour. */
  judge(lane: number, word: string, colour: string) { this.said = { lane, word, colour, t: performance.now() }; this.lit[lane] = performance.now(); }

  private layoutCaps(lanes: Lane[]) {
    const as = input(), key = as + lanes.map((l) => l.ctl + l.label + l.colour).join();
    if (key === this.capsFor) return;
    this.capsFor = key;
    this.caps.replaceChildren();
    lanes.forEach((l, k) => {
      if (as === "touch") {
        const b = document.createElement("button");
        b.className = "tbtn bh-pad";
        b.textContent = l.label;
        b.style.setProperty("--lane", l.colour);
        b.style.pointerEvents = "auto";
        const up = (e: PointerEvent) => { e.preventDefault(); b.classList.remove("on"); this.onLane(k, false); };
        b.addEventListener("pointerdown", (e) => { e.preventDefault(); b.classList.add("on"); this.onLane(k, true); });
        b.addEventListener("pointerup", up);
        b.addEventListener("pointercancel", up);
        this.caps.appendChild(b);
      } else {
        const d = document.createElement("div");
        d.style.setProperty("--lane", l.colour);
        d.innerHTML = keycaps(`{${l.ctl}}`);
        this.caps.appendChild(d);
      }
    });
  }

  draw(f: HighwayFrame) {
    if (this.el.hidden) return;
    this.layoutCaps(f.lanes);
    const dpr = Math.min(2, devicePixelRatio || 1), W = this.cv.clientWidth, H = this.cv.clientHeight;
    if (!W || !H) return;
    if (this.cv.width !== Math.round(W * dpr) || this.cv.height !== Math.round(H * dpr)) { this.cv.width = Math.round(W * dpr); this.cv.height = Math.round(H * dpr); }
    const x = this.cv.getContext("2d")!;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, W, H);
    const now = performance.now(), L = Math.max(1, f.lanes.length);
    const font = (px: number, w = 700) => `${w} ${px}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    const small = W < 420;

    // the top line: the method, the row, and the band's striking under them; on a short screen
    // only the striking, as the mission panel has the rest and there's no room
    const titled = H >= 240;
    if (titled) {
      x.textBaseline = "alphabetic"; x.shadowColor = "rgba(0,0,0,0.8)"; x.shadowBlur = 4;
      x.font = font(small ? 16 : 20, 800); x.textAlign = "left"; x.fillStyle = "#d9a441";
      x.fillText(f.title.toUpperCase(), 4, 18);
      x.textAlign = "right"; x.fillStyle = "#f4f1ea"; x.font = font(small ? 15 : 18);
      x.fillText(f.right, W - 4, 18);
      x.shadowBlur = 0;
    }
    const my = titled ? 26 : 0, m = Math.max(0, Math.min(1, f.meter));
    x.fillStyle = "rgba(11,12,12,0.7)"; x.fillRect(0, my, W, 8);
    x.fillStyle = m < 0.25 ? "#ff5a4e" : m < 0.5 ? "#ffb02e" : "#58e06a";
    x.fillRect(1, my + 1, (W - 2) * m, 6);
    x.fillStyle = "rgba(255,255,255,0.5)"; x.fillRect(W * 0.25, my, 1, 8); x.fillRect(W * 0.5, my, 1, 8);

    // the highway itself, going away from you
    const top = my + 16, hy = H - 34, bw = W * (small ? 0.74 : 0.7), tw = bw * 0.42, cx = W / 2;
    this.caps.style.width = `${bw}px`;
    const A = 1.6, depth = (u: number) => (1 - 1 / (1 + A * u)) / (1 - 1 / (1 + A));
    const yAt = (u: number) => hy - (hy - top) * depth(u);
    const sAt = (u: number) => 1 - (1 - tw / bw) * depth(u);
    const laneX = (k: number, u: number) => cx + (k - (L - 1) / 2) * (bw / L) * sAt(u);
    const below = 0.12;
    x.beginPath();
    x.moveTo(cx - tw / 2, top); x.lineTo(cx + tw / 2, top);
    x.lineTo(cx + (bw / 2) * sAt(-below), yAt(-below)); x.lineTo(cx - (bw / 2) * sAt(-below), yAt(-below));
    x.closePath();
    const g = x.createLinearGradient(0, top, 0, hy);
    g.addColorStop(0, "rgba(11,12,18,0.35)"); g.addColorStop(1, "rgba(11,12,18,0.86)");
    x.fillStyle = g; x.fill();
    x.strokeStyle = "rgba(217,164,65,0.7)"; x.lineWidth = 2; x.stroke();
    // the lanes, each lit in its colour while its key is down
    for (let k = 0; k < L; k++) {
      const lit = this.held[k] ? 1 : Math.max(0, 1 - (now - (this.lit[k] ?? -1e9)) / pressGlow);
      const l = (u: number, side: number) => cx + (k + side - L / 2) * (bw / L) * sAt(u);
      if (lit > 0) {
        x.globalAlpha = 0.22 * lit; x.fillStyle = f.lanes[k].colour;
        x.beginPath(); x.moveTo(l(1, 0), top); x.lineTo(l(1, 1), top); x.lineTo(l(-below, 1), yAt(-below)); x.lineTo(l(-below, 0), yAt(-below)); x.fill();
        x.globalAlpha = 1;
      }
      if (k) { x.strokeStyle = "rgba(255,255,255,0.14)"; x.lineWidth = 1; x.beginPath(); x.moveTo(l(1, 0), top); x.lineTo(l(-below, 0), yAt(-below)); x.stroke(); }
    }
    // a line across for each row, the handstroke rows stronger
    for (const b of f.bars) {
      const u = b.due / AHEAD;
      if (u < -below || u > 1) continue;
      const y = yAt(u), hw = (bw / 2) * sAt(u);
      x.strokeStyle = b.strong ? "rgba(217,164,65,0.45)" : "rgba(255,255,255,0.12)"; x.lineWidth = b.strong ? 2 : 1;
      x.beginPath(); x.moveTo(cx - hw, y); x.lineTo(cx + hw, y); x.stroke();
    }
    // the line you strike on, with a ring for each lane
    x.strokeStyle = "rgba(244,241,234,0.9)"; x.lineWidth = 3;
    x.beginPath(); x.moveTo(cx - bw / 2, hy); x.lineTo(cx + bw / 2, hy); x.stroke();
    const R0 = Math.min(30, (bw / L) * 0.34);
    for (let k = 0; k < L; k++) {
      const lit = this.held[k] ? 1 : Math.max(0, 1 - (now - (this.lit[k] ?? -1e9)) / 220);
      x.lineWidth = 4; x.strokeStyle = f.lanes[k].colour;
      x.fillStyle = lit ? f.lanes[k].colour : "rgba(11,12,12,0.6)";
      x.globalAlpha = lit ? 0.35 + 0.65 * lit : 1;
      x.beginPath(); x.arc(laneX(k, 0), hy, R0, 0, Math.PI * 2); x.fill();
      x.globalAlpha = 1; x.stroke();
    }
    // the notes, the far ones first: the band's faint and small underneath, yours bright over them,
    // a chord's two joined by a bar
    const gems = f.gems.filter((n) => n.due <= AHEAD && n.due / AHEAD > -below && n.state !== 1).sort((a, b) => Number(!a.faint) - Number(!b.faint) || b.due - a.due);
    x.textAlign = "center"; x.textBaseline = "middle";
    for (const n of gems) {
      const u = n.due / AHEAD, s = sAt(u), gy = yAt(u), fade = u < 0 ? Math.max(0, 1 + u / below) : 1;
      if (n.faint) {
        x.globalAlpha = 0.5 * fade; x.fillStyle = "#d8d2c4"; x.strokeStyle = "#d8d2c4"; x.lineWidth = Math.max(1, 2 * s);
        if (n.pair !== undefined) { x.beginPath(); x.moveTo(laneX(n.lane, u), gy); x.lineTo(laneX(n.pair, u), gy); x.stroke(); }
        for (const l of n.pair !== undefined ? [n.lane, n.pair] : [n.lane]) {
          x.beginPath(); x.ellipse(laneX(l, u), gy, R0 * 0.42 * s, R0 * 0.27 * s, 0, 0, Math.PI * 2); x.fill();
        }
        x.globalAlpha = 1;
        continue;
      }
      const r = R0 * 0.82 * s, dead = n.state === 2;
      x.globalAlpha = fade;
      if (n.pair !== undefined) {
        x.strokeStyle = dead ? "#5a5f66" : "#ffffff"; x.lineWidth = Math.max(3, r * 0.45); x.lineCap = "round";
        x.beginPath(); x.moveTo(laneX(n.lane, u), gy); x.lineTo(laneX(n.pair, u), gy); x.stroke();
        x.strokeStyle = dead ? "#2a2d31" : "#d9a441"; x.lineWidth = Math.max(1.5, r * 0.22);
        x.beginPath(); x.moveTo(laneX(n.lane, u), gy); x.lineTo(laneX(n.pair, u), gy); x.stroke();
        x.lineCap = "butt";
      }
      for (const l of n.pair !== undefined ? [n.lane, n.pair] : [n.lane]) {
        const gx = laneX(l, u);
        x.fillStyle = dead ? "#5a5f66" : f.lanes[l]?.colour ?? "#fff";
        x.beginPath(); x.ellipse(gx, gy, r, r * 0.72, 0, 0, Math.PI * 2); x.fill();
        x.lineWidth = Math.max(1.5, 3 * s); x.strokeStyle = dead ? "#2a2d31" : "#fff"; x.stroke();
        x.fillStyle = dead ? "#aab" : "#0b0c0c"; x.font = font(Math.max(10, r * 0.95), 800);
        x.fillText(n.label, gx, gy + 1);
      }
      x.globalAlpha = 1;
    }
    // the word for the last one you struck, and its burst
    if (this.said) {
      const age = (now - this.said.t) / 700;
      if (age < 1) {
        const k = this.said.lane, rx = laneX(k, 0);
        x.globalAlpha = 1 - age;
        x.strokeStyle = this.said.colour; x.lineWidth = 3;
        x.beginPath(); x.arc(rx, hy, R0 * (1 + age * 0.9), 0, Math.PI * 2); x.stroke();
        x.fillStyle = this.said.colour; x.font = font(small ? 22 : 28, 800);
        x.shadowColor = "rgba(0,0,0,0.85)"; x.shadowBlur = 5;
        x.fillText(this.said.word, cx, hy - (hy - top) * 0.32 - age * 14);
        x.shadowBlur = 0; x.globalAlpha = 1;
      } else this.said = null;
    }
    if (f.centre) {
      x.fillStyle = "#f4f1ea"; x.font = font(small ? 24 : 32, 800); x.shadowColor = "rgba(0,0,0,0.85)"; x.shadowBlur = 6;
      x.fillText(f.centre, cx, (top + hy) / 2);
      x.shadowBlur = 0;
    }
    // the multiplier down the left, the score and streak down the right
    // up out of the way of the health and ammo panels where there's height for it
    const side = (W - bw) / 2, lift = titled ? 46 : 0;
    x.shadowColor = "rgba(0,0,0,0.85)"; x.shadowBlur = 4;
    x.textAlign = "center"; x.textBaseline = "alphabetic";
    x.fillStyle = f.mult >= 4 ? "#ffdd00" : f.mult >= 2 ? "#f4f1ea" : "#b9b4a8";
    x.font = font(small ? 26 : 36, 800);
    x.fillText(`×${f.mult}`, side / 2, hy - 18 - lift);
    x.font = font(small ? 11 : 13, 600); x.fillStyle = "#b9b4a8";
    x.fillText("MULTIPLIER", side / 2, hy - 2 - lift);
    x.font = font(small ? 20 : 28, 800); x.fillStyle = "#f4f1ea";
    x.fillText(String(f.score), W - side / 2, hy - 18 - lift);
    x.font = font(small ? 11 : 13, 600); x.fillStyle = "#b9b4a8";
    x.fillText("SCORE", W - side / 2, hy - 2 - lift);
    x.font = font(small ? 15 : 18, 800); x.fillStyle = f.streak >= 10 ? "#ffdd00" : "#f4f1ea";
    x.fillText(`${f.streak} streak`, W - side / 2, hy + 18 - lift);
    x.shadowBlur = 0;
  }

  dispose() { this.el.remove(); }
}
