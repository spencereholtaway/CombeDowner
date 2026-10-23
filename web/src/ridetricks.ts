// The feel of a ride and its score. Airs, spins, the ride's trick, grinds (each style of grind, so
// changing the stick mid-grind is another trick) and manuals (all done in
// player.ts) add up into one combo, THPS style: each adds points and puts the multiplier up one,
// doing the same thing again in a combo is worth less each time, a manual on the flat keeps the
// chain going between them, and coming off loses the lot. The combo ends once you've been rolling
// along on the ground for a moment, and its score shows in one small counter in the middle of the
// screen, with your bests on that ride (longest grind, biggest air, longest manual, best combo),
// which this browser keeps for each ride.
//
// The feel: the view widens as you go faster, the wind gets up in your ears, the wheels rumble
// and grinds scrape, and the view shakes a little on grass, paths and grinds.
//
// Who decides what: nothing here goes over the network. Your tricks and score are yours alone.
import type * as THREE from "three";
import * as SFX from "./audio";
import type { Player, RideEvent } from "./player";
import { note } from "./daily";
import { best } from "./trophies";
import { rideSpecs, type RideKind } from "./rides";

/** Your bests on one ride: metres, metres, seconds and points. */
interface Bests { grind: number; air: number; manual: number; combo: number }
const STORE = "combedowner.rideBests";
const GRACE = 1;   // seconds rolling along on the ground before a combo's over
/** The harder grinds (anything but the plain one) are worth a little more. */
/** How high each style's scrape sounds: noses bright, tails dull, slides coarse. */
const GRIND_TONE = [1, 1.25, 0.8, 0.62, 0.85];
const STYLE_WORTH = [1, 1.25, 1.25, 1.4, 1.4];

interface Combo {
  base: number; mult: number; names: string[]; seen: Map<string, number>;
  grind: number; air: number; manual: number;   // the longest grind, biggest air and longest manual in it
}

const fmt = (n: number) => Math.round(n).toLocaleString("en-GB");
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export class RideTricks {
  /** Degrees to widen the view by, going fast. */
  fov = 0;
  private el: HTMLElement;
  private combo: Combo | null = null;
  private grace = 0;
  private kind: RideKind | null = null;
  private shown = "";
  private result = "";        // the last combo's score (or the bail), shown for a moment
  private resultClass = "";
  private resultT = 0;
  private sound: ReturnType<typeof SFX.rideNoise> = null;
  private bests: Partial<Record<RideKind, Bests>>;

  constructor(private say: (text: string, secs: number) => void) {
    this.el = document.createElement("div");
    this.el.id = "combo";
    this.el.hidden = true;
    document.getElementById("hud")?.appendChild(this.el);
    try { this.bests = JSON.parse(localStorage.getItem(STORE) ?? "{}") ?? {}; } catch { this.bests = {}; }
  }

  /**
   * Every frame. kind: what you're riding, or null when you're not. cam: the view, when it's yours
   * to shake (riding along, not in a car or a trolley's basket).
   */
  update(dt: number, p: Player, kind: RideKind | null, cam: THREE.PerspectiveCamera | null) {
    const on = !!kind && !!p.ride;
    if (on) this.kind = kind;
    for (const e of p.events) if (on) this.take(e, p);
    p.events.length = 0;
    if (on) {
      // the combo runs on while you're in the air, grinding, on a manual or coming off
      const busy = !!p.grind || p.manual > 0 || p.tumble > 0 || (!p.onGround && (!p.ride!.pogo || p.airBig));
      if (this.combo && !busy) { if ((this.grace += dt) > GRACE) this.finish(); }
      else this.grace = 0;
      if (p.kicked) SFX.step(true, 0.35);
    } else if (this.combo) this.finish();

    // the view widens as you go faster
    const tuck = on && p.verbOn ? 2 : 0;
    const want = on ? 9 * clamp01((p.speed - 4) / 14) ** 1.3 + tuck : 0;
    this.fov += (want - this.fov) * Math.min(1, dt * 3);

    // wind, wheels and grinding
    const x = p.pos.x, z = p.pos.z, paved = p.paved(x, z), lift = p.lift(x, z);
    const rough = !paved ? 1 : lift > 0.02 && lift < 0.055 ? 0.5 : 0;   // grass, or a path
    if (on && !this.sound) this.sound = SFX.rideNoise();
    if (!on && this.sound) { this.sound.stop(); this.sound = null; }
    const rolling = on && p.onGround && !p.grind && !p.ride!.pogo && p.tumble <= 0;
    this.sound?.set(clamp01((p.speed - 2) / 16), rolling ? clamp01(p.speed / 10) : 0, rough, p.grind ? Math.max(0.4, clamp01(p.speed / 6)) : 0, p.grind ? GRIND_TONE[p.grind.style] ?? 1 : 1);

    // and a little shake on rough ground, paths and grinds
    if (cam && on && (rolling || p.grind)) {
      const amp = clamp01(p.speed / 10) * (rough ? 0.012 + rough * 0.018 : 0.003) + (p.grind ? 0.012 : 0);
      cam.position.y += (Math.random() - 0.5) * amp;
      cam.rotation.z += (Math.random() - 0.5) * amp * 0.6;
    }
    this.draw(dt, p, on);
  }

  /** Your best combo on a ride, in points (0: none yet), kept on this device. */
  bestCombo(kind: RideKind): number { return this.bests[kind]?.combo ?? 0; }

  /** Something done on the ride: into the combo. */
  private take(e: RideEvent, p: Player) {
    const s = p.ride!;
    switch (e.k) {
      case "air": {
        const deg = Math.abs(e.spin) > 2.6 ? Math.round(Math.abs(e.spin) / Math.PI) * 180 : 0;
        if (!s.pogo && e.t < 0.35 && !deg) return;
        const name = deg ? `${deg}` : s.pogo ? "Big bounce" : "Air";
        this.add(name, 50 * e.t + 100 * e.h + (deg / 180) * 150);
        this.combo!.air = Math.max(this.combo!.air, e.h);
        return;
      }
      case "land": if (e.clean) this.add("Clean landing", 100); return;
      case "trick": this.add(e.name, 250); return;
      case "grind":
        if (e.on) { this.start(); SFX.tick(); return; }
        if (e.len < 0.3) return;
        this.add(e.name, (100 + 30 * e.len) * (STYLE_WORTH[e.style] ?? 1));
        this.combo!.grind = Math.max(this.combo!.grind, e.len);
        return;
      case "manual":
        if (e.on) { this.start(); return; }
        if (e.t < 0.3) return;
        this.add(e.name, 50 + 40 * e.t, `${e.name} ${e.t.toFixed(1)} s`);
        this.combo!.manual = Math.max(this.combo!.manual, e.t);
        return;
      case "bail": this.lose(); return;
    }
  }

  private start(): Combo {
    this.grace = 0;
    return (this.combo ??= { base: 0, mult: 0, names: [], seen: new Map(), grind: 0, air: 0, manual: 0 });
  }

  /** Into the combo: worth less each time you do the same thing again in it. */
  private add(key: string, pts: number, label = key) {
    const c = this.start(), n = c.seen.get(key) ?? 0;
    c.seen.set(key, n + 1);
    c.base += pts / (1 + n);
    c.mult += 1;
    c.names.push(label);
  }

  /** Off the ride: the combo's gone. */
  private lose() {
    const c = this.combo;
    this.combo = null;
    if (!c || !c.mult) return;
    this.showResult(`<b>Bailed</b><small>${fmt(c.base * c.mult)} lost</small>`, "bail", 1.6);
  }

  /** Rolled away clean: bank it, and see how it stacks up against your bests on this ride. */
  private finish() {
    const c = this.combo, kind = this.kind;
    this.combo = null;
    if (!c || !c.mult || !kind) return;
    const total = Math.round(c.base * c.mult);
    note("combo", total);
    best("combo", total);
    const b = (this.bests[kind] ??= { grind: 0, air: 0, manual: 0, combo: 0 }), news: string[] = [];
    if (c.grind > b.grind + 0.05) { b.grind = c.grind; news.push(`grind ${c.grind.toFixed(1)} m`); }
    if (c.air > b.air + 0.05) { b.air = c.air; news.push(`air ${c.air.toFixed(1)} m`); }
    if (c.manual > b.manual + 0.05) { b.manual = c.manual; news.push(`manual ${c.manual.toFixed(1)} s`); }
    if (total > b.combo) { b.combo = total; news.push(`combo ${fmt(total)}`); }
    try { localStorage.setItem(STORE, JSON.stringify(this.bests)); } catch { /* storage may be blocked */ }
    const name = rideSpecs[kind].name.replace(/^an? /, "");
    const bests = [b.grind ? `grind ${b.grind.toFixed(1)} m` : "", b.air ? `air ${b.air.toFixed(1)} m` : "", b.manual ? `manual ${b.manual.toFixed(1)} s` : "", `combo ${fmt(b.combo)}`].filter(Boolean).join(" · ");
    this.showResult(`<b>${fmt(total)}</b> <i>×${c.mult}</i><small>${esc(c.names.slice(-4).join(" + "))}</small>`
      + `<small class="best">${news.length ? "New best! " : ""}Your bests on the ${esc(name)}: ${bests}</small>`, news.length ? "done new" : "done", news.length ? 4 : 3);
    if (news.length) { SFX.jobStep(); this.say(`New best on the ${name}: ${news.join(", ")}`, 2.5); }
    else SFX.pip();
  }

  private showResult(html: string, cls: string, secs: number) {
    this.result = html; this.resultClass = cls; this.resultT = secs;
  }

  /** The counter: the combo going on, or the last one's score for a moment. */
  private draw(dt: number, p: Player, on: boolean) {
    this.resultT = Math.max(0, this.resultT - dt);
    let html = "", cls = "";
    const c = this.combo;
    if (c && on) {
      // what's under way counts already
      let base = c.base, mult = c.mult, live = "";
      if (p.grind) {
        const seg = p.grind.dist - p.grind.seg;
        base += (100 + 30 * seg) * (STYLE_WORTH[p.grind.style] ?? 1); mult++; live = `${p.grindName} ${seg.toFixed(1)} m`;
      }
      else if (p.manual) { base += 50 + 40 * p.manual; mult++; live = `${p.ride!.manual} ${p.manual.toFixed(1)} s`; }
      const names = [...c.names.slice(-3), live].filter(Boolean).join(" + ");
      html = `<b>${fmt(base * Math.max(1, mult))}</b> <i>×${Math.max(1, mult)}</i><small>${esc(names)}</small>`;
      if (p.manual || (p.grind && p.grind.t > 0.9)) html += `<span class="bal"><span style="left:${(50 + 50 * Math.max(-1, Math.min(1, p.grind ? p.grind.bal : p.balance))).toFixed(0)}%"></span></span>`;
    } else if (this.resultT > 0) { html = this.result; cls = this.resultClass; }
    const key = cls + html;
    if (key === this.shown) return;
    this.shown = key;
    this.el.hidden = !html;
    this.el.className = cls;
    this.el.innerHTML = html;
  }
}
