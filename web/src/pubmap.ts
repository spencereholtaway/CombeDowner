// The pub map: "Go to a pub" in the pause menu opens the big map (the one M opens in play, with its
// key, zoom and street names) with a pint on every pub. Point at a pub for its name, how far it is and
// its food hygiene rating, and click or tap it to go there. A click where several pubs crowd together
// (the middle of Bath, zoomed right out) zooms in on them instead.
//
// Nothing here goes over the network: going to a pub just moves you (Game.goTo), and everyone else
// sees you turn up there in your next position update.
import type { Game, MapPicker } from "./game";

const $ = (id: string) => document.getElementById(id)!;
const HELP_MOUSE = "Click a pub to go there · wheel, +/− or pinch to zoom";
const HELP_TOUCH = "Tap a pub to go there · pinch to zoom";
const PICK = 16;            // CSS pixels from a pint that still count as pointing at it
const CROWD_ZOOM = 3;       // how far a click on a crowd of pubs zooms in

export class PubMap implements MapPicker {
  pins: MapPicker["pins"] = [];
  private pubs: ReturnType<Game["pubs"]> = [];
  private hovered = -1;
  private note = "";                    // why you can't go, until you point at something else
  private shown = this.hintText();
  private opened = false;

  /** current: the game being played, if any. onGo: back to playing, after going somewhere. */
  constructor(private current: () => Game | null, private onGo: () => void) {
    // Esc goes back to the pause menu rather than out of it
    addEventListener("keydown", (e) => {
      if (e.code === "Escape" && this.opened) { e.stopImmediatePropagation(); this.back(); }
    }, true);
  }

  get isOpen() { return this.opened; }
  private get game() { return this.current()!; }
  private hintText() { return matchMedia("(pointer: coarse)").matches ? HELP_TOUCH : HELP_MOUSE; }

  open() {
    if (!this.current()) return;
    this.pubs = this.game.pubs();
    this.pins = this.pubs.map((p) => ({ x: p.x, z: p.z, on: false, label: p.name }));
    this.hovered = -1; this.note = "";
    this.opened = true;
    this.game.pickOnMap(this);
    this.say();
  }

  back() {
    this.opened = false;
    this.game.pickOnMap(null);
  }

  hover(x?: number, y?: number) {
    this.point(x === undefined || y === undefined ? -1 : this.game.pinsNear(x, y, PICK)[0] ?? -1);
  }

  /** A click: go to the pub there, or zoom in on a crowd of them. */
  tap(x: number, y: number) {
    const hits = this.game.pinsNear(x, y, PICK);
    if (!hits.length) { this.point(-1); return; }
    if (hits.length > 1) { this.point(-1); this.game.zoomMapAt(x, y, CROWD_ZOOM); return; }
    const why = this.game.goTo(this.pubs[hits[0]].i);
    if (why) { this.point(hits[0]); this.note = why; this.say(); return; }
    this.back();
    this.onGo();
  }

  private point(i: number) {
    if (i === this.hovered) return;
    if (this.pins[this.hovered]) this.pins[this.hovered].on = false;
    if (this.pins[i]) this.pins[i].on = true;
    this.hovered = i; this.note = "";
    this.say();
  }

  private say() {
    const p = this.pubs[this.hovered];
    const far = (m: number) => (m < 20 ? "you're here" : m < 1000 ? `${Math.round(m / 10) * 10} m away` : `${(m / 1000).toFixed(1)} km away`);
    const text = this.note || (p
      ? `${p.name}, ${far(p.far)}${p.rating === null ? "" : `. Food hygiene rating: ${p.rating} out of 5`}`
      : this.pubs.length ? this.hintText() : "No pubs on this map yet.");
    // only write what changed: rewriting the same words makes the bar reflow under the pointer
    if (text !== this.shown || $("bigmaphint").textContent !== text) $("bigmaphint").textContent = text;
    this.shown = text;
  }
}
