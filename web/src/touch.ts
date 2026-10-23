// Controls for when the browser won't capture the mouse (iPad Safari, phones, some in-app browsers).
// Drag on the right of the screen to look, joystick on the left to move, tap to shoot,
// and on-screen buttons for everything else. A keyboard still works alongside.
import type { Game } from "./game";

const STICK = 60; // joystick radius in px

function capture(el: Element, id: number) {
  try { el.setPointerCapture(id); } catch { /* the pointer may already be gone */ }
}

export class TouchControls {
  private stickId = -1;
  private stickX = 0; private stickY = 0;
  private lookId = -1;
  private lastX = 0; private lastY = 0;
  private downAt = 0; private moved = 0;
  private base: HTMLElement; private knob: HTMLElement;

  constructor(private game: Game, private canvas: HTMLCanvasElement, onPause: () => void) {
    const $ = (id: string) => document.getElementById(id)!;
    this.base = $("stickbase"); this.knob = $("stickknob");
    canvas.addEventListener("pointerdown", (e) => this.down(e));
    canvas.addEventListener("pointermove", (e) => this.move(e));
    canvas.addEventListener("pointerup", (e) => this.up(e));
    canvas.addEventListener("pointercancel", (e) => this.up(e));

    // The buttons act on whatever game is being played now: travelling by train (main.ts) builds a
    // new Game, and setGame points these at it, so the on-screen controls keep working afterwards.
    const g = () => this.game;
    const hold = (id: string, on: () => void, off: () => void = () => {}) => {
      const el = $(id);
      el.addEventListener("pointerdown", (e) => { e.preventDefault(); capture(el, e.pointerId); el.classList.add("on"); on(); });
      const end = () => { el.classList.remove("on"); off(); };
      el.addEventListener("pointerup", end);
      el.addEventListener("pointercancel", end);
    };
    hold("t-fire", () => { g().firing = true; g().shootOnce = true; }, () => (g().firing = false));
    hold("t-dl", () => (g().diveReq = -1));
    hold("t-dr", () => (g().diveReq = 1));
    hold("t-jump", () => g().jump(), () => g().jumpEnd());
    hold("t-reload", () => g().reload());
    hold("t-swap", () => g().cycleWeapon(1));
    hold("t-aim", () => { g().aiming = !g().aiming; g().binoculars = false; $("t-aim").classList.toggle("latched", g().aiming); });
    // Crouch, then a second tap lies you down on your front (the streets), then up again
    hold("t-crouch", () => {
      const p = g().player;
      if (p.proneLatch) p.proneLatch = false;
      else if (p.crouchLatch && p.canProne) { p.crouchLatch = false; p.proneLatch = true; }
      else p.crouchLatch = !p.crouchLatch;
      $("t-crouch").classList.toggle("latched", p.crouchLatch || p.proneLatch);
    });
    hold("t-bino", () => g().toggleBinoculars());
    hold("t-torch", () => g().toggleTorch());
    hold("t-car", () => g().useCar());
    hold("t-view", () => g().toggleView());
    hold("t-sigl", () => g().indicate(1));
    hold("t-sigr", () => g().indicate(-1));
    hold("t-ride", () => g().toggleRide());
    // on a ride: grind a kerb or wall alongside, or hold it for a manual (Shift)
    hold("t-trick", () => (g().player.trickHeld = true), () => (g().player.trickHeld = false));
    // the bus menu's buttons, at a stop
    $("usehint").addEventListener("pointerdown", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-bus]");
      if (b) { e.preventDefault(); e.stopPropagation(); g().callBus(b.dataset.bus as "bus" | "minibus"); }
    });
    hold("t-pause", onPause);
    hold("t-radio", () => g().voice.radio(true), () => g().voice.radio(false));
  }

  /** Play a different Game from now on (travelling to another town): the buttons follow it. */
  setGame(game: Game) { this.game = game; }

  private down(e: PointerEvent) {
    if (!this.game.active || !this.game.freeMode) return;
    e.preventDefault();
    capture(this.canvas, e.pointerId);
    if (e.pointerType === "touch" && e.clientX < innerWidth * 0.4 && this.stickId < 0) {
      this.stickId = e.pointerId;
      this.stickX = e.clientX; this.stickY = e.clientY;
      this.base.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      this.knob.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      this.base.hidden = this.knob.hidden = false;
    } else if (this.lookId < 0) {
      this.lookId = e.pointerId;
      this.lastX = e.clientX; this.lastY = e.clientY;
      this.downAt = performance.now(); this.moved = 0;
    }
  }

  private move(e: PointerEvent) {
    if (e.pointerId === this.stickId) {
      let dx = e.clientX - this.stickX, dy = e.clientY - this.stickY;
      const d = Math.hypot(dx, dy);
      if (d > STICK) { dx *= STICK / d; dy *= STICK / d; }
      this.knob.style.transform = `translate(${this.stickX + dx}px, ${this.stickY + dy}px)`;
      this.game.player.joy.x = dx / STICK;
      this.game.player.joy.y = dy / STICK;
    } else if (e.pointerId === this.lookId) {
      const dx = e.clientX - this.lastX, dy = e.clientY - this.lastY;
      this.lastX = e.clientX; this.lastY = e.clientY;
      this.moved += Math.abs(dx) + Math.abs(dy);
      this.game.look(dx * 1.6, dy * 1.6);
    }
  }

  private up(e: PointerEvent) {
    if (e.pointerId === this.stickId) {
      this.stickId = -1;
      this.game.player.joy.x = this.game.player.joy.y = 0;
      this.base.hidden = this.knob.hidden = true;
    } else if (e.pointerId === this.lookId) {
      this.lookId = -1;
      // a quick tap without dragging fires one shot
      if (this.moved < 10 && performance.now() - this.downAt < 300) this.game.shootOnce = true;
    }
  }
}
