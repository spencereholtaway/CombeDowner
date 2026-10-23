// The brass combination lock on a treasure trail's tin (trail.ts): three wheels of 0 to 9, set to a
// code read off the place (clues.ts says what to count). Get it wrong and the lock jams with a clunk
// for ten seconds while the tin rattles at you. On a touch screen each wheel has a tap above and
// below it; at a keyboard W and S turn the wheel you're on and A and D move between them (or the
// scroll wheel turns it, or type the digits), E or Enter tries it, and Escape leaves it.
//
// While the lock's up it has the keyboard and the scroll wheel to itself: they're caught before the
// game sees them, so turning a wheel doesn't walk you off or change your gun.
//
// Who decides what: nobody. The lock is your own; opening the tin is what goes round (trail.ts).
import * as SFX from "./audio";

const JAM = 10;   // seconds a wrong code jams the lock

export interface LockAsk {
  /** What to count, wheel by wheel, as HTML. */
  ask: string;
  code: number[];
  onOpen(): void;
  onJam(): void;
}

let css = false;
function style() {
  if (css) return;
  css = true;
  const s = document.createElement("style");
  s.textContent = `
#tinlock{position:fixed;left:50%;bottom:12%;transform:translateX(-50%);z-index:8;pointer-events:auto;user-select:none;-webkit-user-select:none;
 background:linear-gradient(#3a2a18,#21170d);border:3px solid #b8892e;border-radius:14px;padding:12px 16px 14px;color:#f4e6c0;
 font:600 15px/1.3 "Barlow Condensed",system-ui,sans-serif;text-align:center;max-width:min(92vw,420px);box-shadow:0 8px 30px rgba(0,0,0,.6)}
#tinlock .ask{margin:0 0 10px;font-weight:500}
#tinlock .wheels{display:flex;gap:12px;justify-content:center}
#tinlock .wheel{display:flex;flex-direction:column;align-items:center;gap:4px}
#tinlock .wheel button{width:58px;height:40px;font:700 20px system-ui;border-radius:8px;border:2px solid #8a6420;background:#5a4220;color:#f4e6c0;touch-action:manipulation}
#tinlock .wheel .n{width:58px;height:62px;display:flex;align-items:center;justify-content:center;font:800 40px Georgia,serif;color:#2a1c08;
 background:linear-gradient(#a87a2a,#f1cf6e 45%,#d9a843 55%,#8a6420);border-radius:8px;border:2px solid #5a4220}
#tinlock .wheel.on .n{outline:3px solid #fff2b0}
#tinlock .row{display:flex;gap:10px;justify-content:center;margin-top:12px}
#tinlock .row button{min-width:96px;height:42px;font:700 17px "Barlow Condensed",system-ui;border-radius:8px;border:2px solid #b8892e;background:#7a5a20;color:#fff;touch-action:manipulation}
#tinlock .row button:disabled{opacity:.45}
#tinlock .jam{color:#ff8a6a;min-height:1.3em;margin-top:6px}
#tinlock .keys{opacity:.7;font-size:13px;margin-top:6px}`;
  document.head.appendChild(s);
}

export class Lock {
  private el: HTMLDivElement | null = null;
  private o: LockAsk | null = null;
  private set = [0, 0, 0];
  private cur = 0;
  private jamT = 0;
  private stop = new AbortController();

  get open() { return !!this.el; }

  /** Put the lock up for the tin in front of you, with the wheels where they were last left. */
  show(o: LockAsk, was?: number[]) {
    this.hide();
    style();
    this.o = o; this.cur = 0;
    if (was) this.set = was.slice(0, 3);
    const el = (this.el = document.createElement("div"));
    el.id = "tinlock";
    const touch = matchMedia("(pointer: coarse)").matches;
    el.innerHTML = `<p class="ask">${o.ask}</p><div class="wheels">${[0, 1, 2].map((k) =>
      `<div class="wheel" data-k="${k}"><button data-d="1" aria-label="Up">▲</button><div class="n">0</div><button data-d="-1" aria-label="Down">▼</button></div>`).join("")}</div>`
      + `<div class="jam"></div><div class="row"><button class="try">Try it</button><button class="leave">Leave it</button></div>`
      + (touch ? "" : `<div class="keys">W/S or the wheel to turn · A/D to move · E to try · Esc to leave</div>`);
    el.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      const b = (e.target as HTMLElement).closest("button");
      if (!b) return;
      e.preventDefault();
      const w = b.closest<HTMLElement>(".wheel");
      if (w) { this.cur = Number(w.dataset.k); this.turn(Number(b.dataset.d)); }
      else if (b.classList.contains("try")) this.attempt();
      else this.hide();
    });
    document.body.appendChild(el);
    this.stop = new AbortController();
    const sig = { capture: true, signal: this.stop.signal };
    addEventListener("keydown", (e) => this.key(e), sig);
    addEventListener("wheel", (e) => { e.stopPropagation(); if (e.deltaY) this.turn(e.deltaY < 0 ? 1 : -1); }, sig);
    addEventListener("mousedown", (e) => { if (document.pointerLockElement) e.stopPropagation(); }, sig);
    this.draw();
  }

  hide() {
    this.stop.abort();
    this.el?.remove();
    this.el = null; this.o = null;
  }

  /** Where the wheels were left, for the next time this tin's lock comes up. */
  get wheels() { return this.set.slice(); }

  update(dt: number) {
    if (this.jamT <= 0) return;
    this.jamT = Math.max(0, this.jamT - dt);
    if (this.el) this.draw();
  }

  private key(e: KeyboardEvent) {
    if (!this.el) return;
    const c = e.code;
    const used = () => { e.stopPropagation(); e.preventDefault(); };
    if (c === "KeyW" || c === "ArrowUp") { used(); this.turn(1); }
    else if (c === "KeyS" || c === "ArrowDown") { used(); this.turn(-1); }
    else if (c === "KeyA" || c === "ArrowLeft") { used(); this.cur = (this.cur + 2) % 3; this.draw(); }
    else if (c === "KeyD" || c === "ArrowRight") { used(); this.cur = (this.cur + 1) % 3; this.draw(); }
    else if (/^(Digit|Numpad)\d$/.test(c)) { used(); this.set[this.cur] = Number(c.slice(-1)); this.cur = Math.min(2, this.cur + 1); SFX.tick(); this.draw(); }
    else if (c === "KeyE" || c === "Enter" || c === "NumpadEnter" || c === "Space") { used(); if (!e.repeat) this.attempt(); }
    else if (c === "Escape" || c === "Backspace" || c === "KeyQ") { used(); this.hide(); }
  }

  private turn(by: number) {
    if (this.jamT > 0) { SFX.tick(); return; }
    this.set[this.cur] = (this.set[this.cur] + by + 10) % 10;
    SFX.tick();
    this.draw();
  }

  private attempt() {
    const o = this.o;
    if (!o || this.jamT > 0) return;
    if (this.set.every((v, k) => v === o.code[k])) { this.hide(); o.onOpen(); return; }
    this.jamT = JAM;
    SFX.warmer(false);
    SFX.tinRattle(0, 0);
    setTimeout(() => SFX.tinRattle(0, 0.3), 260);
    o.onJam();
    this.draw();
  }

  private draw() {
    const el = this.el;
    if (!el) return;
    el.querySelectorAll<HTMLElement>(".wheel").forEach((w, k) => {
      w.classList.toggle("on", k === this.cur);
      const n = w.querySelector(".n")!;
      if (n.textContent !== String(this.set[k])) n.textContent = String(this.set[k]);
    });
    const jam = el.querySelector(".jam")!, t = this.jamT > 0 ? `Jammed! ${Math.ceil(this.jamT)} s` : "";
    if (jam.textContent !== t) jam.textContent = t;
    (el.querySelector(".try") as HTMLButtonElement).disabled = this.jamT > 0;
  }
}
