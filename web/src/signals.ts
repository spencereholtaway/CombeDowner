// Signals: three small ways to tell your friends something across the town without a mic, used by
// the treasure trail (trail.ts) and handy anywhere.
// - A flare (L, or the Flare button): a red ball of light shot 60 m up from where you stand, hanging
//   there and drifting down for half a minute, seen right across the town. On a trail you get one
//   per leg; otherwise one a minute.
// - A whistle (H on foot, or the Whistle button): a two-fingered whistle heard from where you are by
//   anyone within 300 m, further than voices carry.
// - A pencil (P with the big map open, or its Pencil button): draw on the big map with a finger or
//   the mouse, and everyone in the room sees your lines in your colour. Rub out takes yours off. On
//   a trail they're wiped when the leg changes. The trail can also pencil lines of its own onto your
//   map alone (a look-out's bearing).
//
// Who decides what: each player sends their own flares, whistles and pencil lines as "sg", and
// sends their lines again to anyone who joins. A page that doesn't know "sg" just sees and hears
// none of them.
import * as THREE from "three";
import * as SFX from "./audio";

const FLARE_UP = 60;        // metres the flare goes up
const RISE = 2.2;           // seconds to get there
const HANG = 28;            // seconds it hangs and drifts down
const SINK = 1.1;           // metres a second it drifts down
const FLARE_EVERY = 60;     // seconds between flares, off a trail
const FLARES = 4;           // flares in the sky at once
const MAX_POINTS = 80;      // points in one pencil line
const MAX_LINES = 12;       // lines each player keeps

/** A line on the big map (scene x, z pairs), in its owner's colour; dashed: one the game pencilled in. */
export interface PencilLine { pts: number[]; colour: string; dash?: boolean }

export interface SignalWorld {
  readonly scene: THREE.Scene;
  readonly selfId: string;
  me(): { x: number; y: number; z: number; alive: boolean; driving: boolean };
  send(data: unknown, to?: string): void;
  hear(x: number, y: number, z: number): [number, number];
  nameOf(id: string): string;
  colourOf(id: string): string;
  feed(html: string): void;
  toast(text: string, secs?: number): void;
  flash(x: number, y: number, z: number, colour: string, peak: number): void;
  /** Where on the ground a point on the big map is (page pixels), and metres to the pixel there. */
  fromMap(clientX: number, clientY: number): { x: number; z: number; mpp: number } | undefined;
  /** And the big map's crosshair, when the mouse is captured. */
  cursor(): { x: number; z: number; mpp: number } | undefined;
  mapOpen(): boolean;
}

interface Flare { s: THREE.Sprite; x: number; y0: number; z: number; t: number; banged: boolean }

let glowTex: THREE.CanvasTexture | undefined;
function glow() {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!, r = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,230,1)"); r.addColorStop(0.25, "rgba(255,90,60,0.95)"); r.addColorStop(1, "rgba(255,40,20,0)");
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return (glowTex = new THREE.CanvasTexture(c));
}

export class Signals {
  /** Everyone's pencil lines and the game's own, for the big map (minimap.ts). Rebuilt only when they change. */
  lines: PencilLine[] = [];
  private mine: { id: number; pts: number[] }[] = [];
  private theirs = new Map<string, { id: number; pts: number[] }[]>();
  private own = new Map<string, number[]>();     // the game's pencilled lines, by key, yours alone
  private drawing: number[] | null = null;
  private nextId = 1;
  private pencilOn = false;
  private flares: Flare[] = [];
  private flareT = 0;
  private allowance: number | null = null;     // on a trail: flares left this leg
  private stop = new AbortController();
  private btns: HTMLElement[] = [];
  private bar: HTMLElement | null = null;

  constructor(private w: SignalWorld) {
    for (let k = 0; k < FLARES; k++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: "#ffffff", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false, sizeAttenuation: false }));
      s.scale.set(0.04, 0.04, 1); s.visible = false; s.renderOrder = 6;
      w.scene.add(s);
      this.flares.push({ s, x: 0, y0: 0, z: 0, t: 99, banged: true });
    }
    this.controls();
  }

  // ---- flares and whistles ----------------------------------------------------------------------

  /** A trail's leg begins: n flares for it (null: back to one a minute). */
  allow(n: number | null) { this.allowance = n; }

  flare() {
    const me = this.w.me();
    if (!me.alive) return;
    if (this.allowance !== null ? this.allowance <= 0 : this.flareT > 0) {
      this.w.toast(this.allowance !== null ? "No flares left for this clue" : `Next flare in ${Math.ceil(this.flareT)} s`, 1.5);
      return;
    }
    if (this.allowance !== null) this.allowance--;
    else this.flareT = FLARE_EVERY;
    const p = [Math.round(me.x * 10) / 10, Math.round(me.y * 10) / 10, Math.round(me.z * 10) / 10];
    this.w.send({ k: "f", p });
    this.launch(p[0], p[1], p[2]);
    this.w.toast("Flare up! Everyone can see it", 2);
  }

  whistle() {
    const me = this.w.me();
    if (!me.alive || me.driving) return;
    this.w.send({ k: "w", p: [Math.round(me.x), Math.round(me.y), Math.round(me.z)] });
    SFX.callWhistle(0, 0);
  }

  private launch(x: number, y: number, z: number) {
    const f = this.flares.reduce((a, b) => (b.t > a.t ? b : a));
    f.x = x; f.y0 = y; f.z = z; f.t = 0; f.banged = false;
    f.s.visible = true;
    const [d, pan] = this.w.hear(x, y, z);
    SFX.rocket(d, pan);
  }

  update(dt: number) {
    this.flareT = Math.max(0, this.flareT - dt);
    for (const f of this.flares) {
      if (!f.s.visible) continue;
      f.t += dt;
      if (f.t > RISE + HANG) { f.s.visible = false; continue; }
      const up = f.t < RISE ? FLARE_UP * (1 - (1 - f.t / RISE) ** 2) : FLARE_UP - (f.t - RISE) * SINK;
      f.s.position.set(f.x + Math.sin(f.t * 0.3) * 2, f.y0 + 1.5 + up, f.z);
      const m = f.s.material as THREE.SpriteMaterial;
      m.opacity = (f.t < RISE ? 0.7 : 1) * Math.min(1, (RISE + HANG - f.t) / 4) * (0.85 + 0.15 * Math.sin(f.t * 23));
      if (!f.banged && f.t >= RISE) {
        f.banged = true;
        this.w.flash(f.x, f.y0 + FLARE_UP, f.z, "#ff4a2a", 350);
        const [d, pan] = this.w.hear(f.x, f.y0 + FLARE_UP, f.z);
        SFX.bang(d, pan, false);
      }
    }
  }

  // ---- the pencil -------------------------------------------------------------------------------

  /** Pencil a line of the game's onto your own map (key), or take it off (null). */
  pencil(key: string, pts: number[] | null) {
    if (pts) this.own.set(key, pts); else this.own.delete(key);
    this.rebuild();
  }

  /** A trail's leg changed: every line comes off, everyone's alike. */
  wipe() {
    this.mine.length = 0; this.theirs.clear(); this.own.clear(); this.drawing = null;
    this.rebuild();
  }

  private rubOut() {
    this.mine.length = 0;
    this.w.send({ k: "x" });
    this.rebuild();
  }

  private rebuild() {
    const out: PencilLine[] = [];
    const me = this.w.colourOf(this.w.selfId);
    for (const l of this.mine) out.push({ pts: l.pts, colour: me });
    if (this.drawing) out.push({ pts: this.drawing, colour: me });
    for (const [id, ls] of this.theirs) for (const l of ls) out.push({ pts: l.pts, colour: this.w.colourOf(id) });
    for (const pts of this.own.values()) out.push({ pts, colour: "#ffd84a", dash: true });
    this.lines = out;
  }

  private add(x: number, z: number, mpp: number) {
    const d = this.drawing;
    if (!d || d.length >= MAX_POINTS * 2) return;
    if (d.length && Math.hypot(d[d.length - 2] - x, d[d.length - 1] - z) < mpp * 5) return;
    d.push(Math.round(x), Math.round(z));
    this.rebuild();
  }

  private finish() {
    const d = this.drawing;
    this.drawing = null;
    if (!d || d.length < 4) { this.rebuild(); return; }
    const line = { id: this.nextId++, pts: d };
    this.mine.push(line);
    if (this.mine.length > MAX_LINES) this.mine.shift();
    this.w.send({ k: "p", i: line.id, c: d });
    this.rebuild();
  }

  private setPencil(on: boolean) {
    this.pencilOn = on;
    this.bar?.querySelector(".pencil")?.classList.toggle("on", on);
    if (on) this.w.toast("Pencil: draw on the map. Everyone sees your lines", 2);
  }

  // ---- the network ------------------------------------------------------------------------------

  onMessage(d: any, from: string) {
    if (!d || typeof d !== "object") return;
    const p = Array.isArray(d.p) ? d.p.map(Number) : null;
    if (d.k === "f" && p?.length === 3 && p.every(Number.isFinite)) {
      this.launch(p[0], p[1], p[2]);
      this.w.feed(`<b style="color:${this.w.colourOf(from)}">${this.esc(this.w.nameOf(from))}</b> sent up a flare`);
    } else if (d.k === "w" && p?.length === 3 && p.every(Number.isFinite)) {
      const [dist, pan] = this.w.hear(p[0], p[1], p[2]);
      SFX.callWhistle(dist, pan);
      if (dist < 300) this.w.feed(`<b style="color:${this.w.colourOf(from)}">${this.esc(this.w.nameOf(from))}</b> whistled`);
    } else if (d.k === "p" && Array.isArray(d.c)) {
      const pts = d.c.slice(0, MAX_POINTS * 2).map(Number);
      if (pts.length < 4 || !pts.every(Number.isFinite)) return;
      const list = this.theirs.get(from) ?? this.theirs.set(from, []).get(from)!;
      const id = Number(d.i) || 0, at = list.findIndex((l) => l.id === id);
      if (at >= 0) list[at].pts = pts; else list.push({ id, pts });
      if (list.length > MAX_LINES) list.shift();
      this.rebuild();
    } else if (d.k === "x") {
      this.theirs.delete(from);
      this.rebuild();
    }
  }

  /** Someone joined: they get your lines. */
  joined(id: string) { for (const l of this.mine) this.w.send({ k: "p", i: l.id, c: l.pts }, id); }
  left(id: string) { if (this.theirs.delete(id)) this.rebuild(); }

  private esc(s: string) { return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`); }

  // ---- controls ---------------------------------------------------------------------------------

  private controls() {
    const sig = { signal: this.stop.signal };
    addEventListener("keydown", (e) => {
      if (e.repeat || e.target instanceof HTMLInputElement) return;
      if (e.code === "KeyL" && !this.w.mapOpen()) this.flare();
      if (e.code === "KeyH" && !this.w.mapOpen()) this.whistle();
      if (e.code === "KeyP" && this.w.mapOpen()) this.setPencil(!this.pencilOn);
    }, sig);
    // the touch buttons, down the left of the screen, clear of the stick
    const touch = document.getElementById("touch");
    if (touch) {
      const col = document.createElement("div");
      col.style.cssText = "position:absolute;left:12px;top:30%;display:flex;flex-direction:column;gap:10px";
      col.id = "t-signals";
      for (const [label, fn] of [["Flare", () => this.flare()], ["Whistle", () => this.whistle()]] as const) {
        const b = document.createElement("button");
        b.className = "tbtn small"; b.textContent = label;
        b.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); fn(); });
        col.appendChild(b);
      }
      touch.appendChild(col);
      this.btns.push(col);
    }
    // the big map's pencil and rubber
    const bar = document.querySelector<HTMLElement>("#bigmap .bigmapbar"), wrap = document.getElementById("bigmapwrap");
    if (bar && wrap) {
      const box = (this.bar = document.createElement("span"));
      box.style.cssText = "display:inline-flex;gap:8px;margin-right:8px";
      box.innerHTML = `<button type="button" class="pencil">Pencil (P)</button><button type="button" class="rub">Rub out</button>`;
      box.addEventListener("pointerdown", (e) => {
        e.stopPropagation(); e.preventDefault();
        const b = (e.target as HTMLElement).closest("button");
        if (b?.classList.contains("pencil")) this.setPencil(!this.pencilOn);
        else if (b?.classList.contains("rub")) this.rubOut();
      });
      bar.prepend(box);
      this.btns.push(box);
      const style = document.createElement("style");
      style.textContent = "#bigmap .bigmapbar .pencil.on{background:#ffdd00;color:#14161c}";
      box.appendChild(style);
      // a finger or an uncaptured mouse draws, before the map's own drag and tap see it
      let id = -1;
      wrap.addEventListener("pointerdown", (e) => {
        if (!this.pencilOn || id >= 0 || document.pointerLockElement || (e.target as HTMLElement).id !== "bigmapcanvas") return;
        e.stopPropagation(); e.preventDefault();
        id = e.pointerId;
        try { wrap.setPointerCapture(id); } catch { /* gone already */ }
        this.drawing = [];
        const at = this.w.fromMap(e.clientX, e.clientY);
        if (at) this.add(at.x, at.z, 0);
      }, { capture: true, signal: this.stop.signal });
      wrap.addEventListener("pointermove", (e) => {
        if (e.pointerId !== id) return;
        e.stopPropagation();
        const at = this.w.fromMap(e.clientX, e.clientY);
        if (at) this.add(at.x, at.z, at.mpp);
      }, { capture: true, signal: this.stop.signal });
      const up = (e: PointerEvent) => { if (e.pointerId !== id) return; e.stopPropagation(); id = -1; this.finish(); };
      wrap.addEventListener("pointerup", up, { capture: true, signal: this.stop.signal });
      wrap.addEventListener("pointercancel", up, { capture: true, signal: this.stop.signal });
      // with the mouse captured, the crosshair draws while the button's held
      addEventListener("mousedown", (e) => {
        if (!this.pencilOn || !this.w.mapOpen() || !document.pointerLockElement || e.button !== 0) return;
        e.stopPropagation();
        this.drawing = [];
        const at = this.w.cursor();
        if (at) this.add(at.x, at.z, 0);
      }, { capture: true, signal: this.stop.signal });
      addEventListener("mousemove", () => {
        if (!this.drawing || !document.pointerLockElement) return;
        const at = this.w.cursor();
        if (at) this.add(at.x, at.z, at.mpp);
      }, sig);
      addEventListener("mouseup", () => { if (this.drawing && document.pointerLockElement) this.finish(); }, sig);
    }
  }

  dispose() {
    this.stop.abort();
    for (const b of this.btns) b.remove();
    for (const f of this.flares) { this.w.scene.remove(f.s); f.s.material.dispose(); }
  }
}
