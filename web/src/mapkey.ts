// The big map's key: what each thing on the maps is, drawn with the same icon, and on each row a
// switch to take that kind of thing off the maps (the minimap, the big map and the pub map alike).
// It sits in the big map's top left corner and folds away to one button. What's switched off, and
// whether the key is folded, are kept in this browser's localStorage (cd-mapoff, cd-mapkey), the same
// way the Settings page keeps its options, so it's the same next time on this computer.
//
// With the mouse captured there's no pointer, so the big map's crosshair works the key too: the row
// under it lights up, and a click switches it (game.ts asks clickAt before putting a marker down).
//
// Who decides what: all your own. Nothing here goes over the network.
import { arrow, bendyIcon, cableIcon, jobIcon, pinIcon, ROUTE, spotIcon, stopIcon, trapIcon } from "./minimap";
import { BLIP } from "./pickups";
import { jobKinds } from "./quests";

const OFF_KEY = "cd-mapoff", FOLD_KEY = "cd-mapkey";
const SIZE = 22;   // an icon's size, CSS pixels

type Draw = (g: CanvasRenderingContext2D, s: number) => void;
/** A row of the key. layer: what it switches (none: it's always shown, like you). */
interface Row { layer?: string; label: string; note?: string; icon: Draw; dots?: [string, string][] }

/** A few words on what each kind of job is, by its id. */
const JOB_NOTES: Record<string, string> = {
  race: "ride to a place across town against the clock",
  trail: "follow the clues to the treasure",
  wanted: "track down a ringleader",
  gulls: "see off the seagulls",
};

const dots = (cols: string[]): Draw => (g, s) => {
  cols.forEach((c, i) => {
    g.fillStyle = c; g.beginPath();
    g.arc(s * (0.22 + 0.28 * i), s * (i % 2 ? 0.38 : 0.62), s * 0.13, 0, Math.PI * 2); g.fill();
  });
};

function sections(): [string, Row[]][] {
  const jobs: Row[] = jobKinds().map((k) => ({
    layer: "job-" + k.id, label: k.label, note: JOB_NOTES[k.id],
    icon: (g, s) => jobIcon(g, s / 2, s / 2, s / 15, k.colour, k.glyph),
  }));
  jobs.push({
    layer: "search", label: "Where to search", note: "a job's clue or last sighting",
    icon: (g, s) => {
      g.beginPath(); g.arc(s / 2, s / 2, s * 0.36, 0, Math.PI * 2);
      g.fillStyle = "rgba(224,165,38,0.2)"; g.fill();
      g.strokeStyle = "#e0a526"; g.lineWidth = s / 12; g.setLineDash([s / 6, s / 9]); g.stroke();
    },
  });
  return [
    ["Jobs: walk up to the noticeboard", jobs],
    ["Free play", [
      { layer: "traps", label: "Speed traps", note: "ride through one to get clocked", icon: (g, s) => trapIcon(g, s / 2, s / 2, s / 13) },
      { layer: "games", label: "Minigames", note: "the mine tours and the deli", icon: (g, s) => spotIcon(g, s / 2, s / 2, s / 12.5) },
      { layer: "cable", label: "Cable car", note: "its line and stations", icon: (g, s) => cableIcon(g, s / 2, s / 2, s / 12.5) },
      { layer: "stops", label: "Bus stops", note: "E at one to call a bus", icon: (g, s) => stopIcon(g, s / 2, s / 2, s / 10) },
      { layer: "route", label: "Your bus route", note: "the 2 or the 4, when you drive a bus", icon: (g, s) => {
        g.strokeStyle = ROUTE; g.lineWidth = s / 6; g.lineCap = "round";
        g.beginPath(); g.moveTo(s * 0.1, s * 0.75); g.lineTo(s * 0.45, s * 0.35); g.lineTo(s * 0.9, s * 0.45); g.stroke();
        stopIcon(g, s * 0.45, s * 0.35, s / 14, ROUTE);
      } },
    ]],
    ["People and things", [
      { label: "You", icon: (g, s) => { g.translate(s / 2, s / 2); g.fillStyle = "#ffdd00"; g.strokeStyle = "rgba(0,0,0,0.7)"; g.lineWidth = s / 14; arrow(g, s / 22); g.fill(); g.stroke(); } },
      { layer: "players", label: "Other players", icon: (g, s) => { g.translate(s / 2, s / 2); g.rotate(0.5); g.fillStyle = "#5fb4ff"; g.strokeStyle = "rgba(0,0,0,0.75)"; g.lineWidth = s / 16; arrow(g, s / 22); g.fill(); g.stroke(); } },
      { layer: "markers", label: "Map markers", note: "tap the map, or press G", icon: (g, s) => pinIcon(g, s / 2, s * 0.92, s / 19, "#5fb4ff") },
      { layer: "pickups", label: "Pickups and rides", icon: dots([BLIP.pint, BLIP.trolley, BLIP.ammo]), dots: [
        [BLIP.pint, "Pint"], [BLIP.ammo, "Rifle rounds"], [BLIP.sniper, "Sniper rifle"], [BLIP.sammo, "Sniper rounds"],
        [BLIP.boost, "Lucozade"], [BLIP.fizz, "Bucks Fizz"], [BLIP.trolley, "A ride"],
      ] },
      { layer: "people", label: "Naughty boys and cats", note: "close by", icon: dots(["#f4f4f4", "#8f949a", "#ff9a2a"]), dots: [
        ["#f4f4f4", "Naughty boy after someone"], ["#8f949a", "Hanging about"], ["#ff9a2a", "Cat out for blood"],
      ] },
      { layer: "bendy", label: "Bendy", note: "out at night; red when he's after someone", icon: (g, s) => bendyIcon(g, s / 2, s / 2, s / 14) },
      { label: "Your bus, the ball", icon: dots(["#3fd06a", "#f4f1e8"]), dots: [["#3fd06a", "Your bus coming"], ["#f4f1e8", "The ball"]] },
    ]],
    ["The map", [
      { layer: "flags", label: "Flag Lads' squares", note: "red held, green freed", icon: (g, s) => {
        g.fillStyle = "rgba(214,40,52,0.6)"; g.fillRect(s * 0.1, s * 0.1, s * 0.4, s * 0.8);
        g.fillStyle = "rgba(79,209,139,0.6)"; g.fillRect(s * 0.5, s * 0.1, s * 0.4, s * 0.8);
      } },
      { layer: "yours", label: "Squares you've cleared", note: "faint green; a pint on each pub you've won back, an amber ring where a scar's waiting", icon: (g, s) => {
        g.fillStyle = "rgba(120,224,160,0.35)"; g.fillRect(s * 0.1, s * 0.1, s * 0.8, s * 0.8);
        g.strokeStyle = "#d79a2b"; g.lineWidth = s / 14; g.strokeRect(s * 0.16, s * 0.16, s * 0.68, s * 0.68);
      } },
      { layer: "streets", label: "Street names", icon: (g, s) => {
        g.fillStyle = "#f4f1ea"; g.font = `600 ${s * 0.6}px "Barlow Condensed", system-ui, sans-serif`;
        g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("Abc", s / 2, s / 2);
      } },
    ]],
  ];
}

function loadOff(): Set<string> {
  try { const v = JSON.parse(localStorage.getItem(OFF_KEY) ?? "[]"); return new Set(Array.isArray(v) ? v.map(String) : []); } catch { return new Set(); }
}

export class MapKey {
  /** The layers switched off. */
  readonly off = loadOff();
  private el: HTMLElement;
  private lit: HTMLElement | null = null;
  /** The note on the row under the pointer or the crosshair, drawn over everything beside the key. */
  private tip = document.createElement("div");

  /** Builds the key into el. changed: called whenever a layer is switched. */
  constructor(el: HTMLElement, private changed: (off: Set<string>) => void) {
    this.el = el;
    // a tap on the key mustn't reach the map under it (which puts a marker down) or the dark round
    // it (which closes the map)
    el.addEventListener("pointerdown", (e) => e.stopPropagation());
    el.addEventListener("wheel", (e) => e.stopPropagation(), { passive: true });
    const head = document.createElement("button");
    head.type = "button"; head.className = "keyhead";
    head.innerHTML = `<span>Key</span><small>click to hide</small><b aria-hidden="true"></b>`;
    head.addEventListener("click", () => this.fold(!el.classList.contains("folded")));
    const body = document.createElement("div");
    body.className = "keybody";
    const dpr = Math.min(2, devicePixelRatio || 1);
    for (const [title, rows] of sections()) {
      const h = document.createElement("p");
      h.className = "keysection"; h.textContent = title;
      if (title.startsWith("Jobs")) h.dataset.tip = "Today's jobs are on noticeboards round Bath. Walk up to one to read it and take it on. A badge is faded once you've done that job today.";
      body.append(h);
      for (const r of rows) {
        const row = document.createElement(r.layer ? "button" : "div");
        row.className = "keyrow";
        const c = document.createElement("canvas");
        c.width = c.height = SIZE * dpr;
        const g = c.getContext("2d")!;
        g.save(); r.icon(g, SIZE * dpr); g.restore();
        const text = document.createElement("span");
        text.textContent = r.label;
        if (r.note) row.dataset.tip = `${r.label}: ${r.note}`;
        row.append(c, text);
        if (r.layer && row instanceof HTMLButtonElement) {
          const layer = r.layer;
          row.type = "button";
          row.dataset.layer = layer;
          row.setAttribute("aria-pressed", String(!this.off.has(layer)));
          row.addEventListener("click", () => this.toggle(layer, row));
        }
        body.append(row);
        // a dot's colour, one by one
        if (r.dots) {
          const list = document.createElement("div");
          list.className = "keydots";
          for (const [colour, name] of r.dots) {
            const d = document.createElement("span");
            d.style.setProperty("--dot", colour);
            d.textContent = name;
            list.append(d);
          }
          body.append(list);
        }
      }
    }
    el.append(head, body);
    // the note shows as soon as the pointer's on a row, not the browser's slow little label
    this.tip.id = "keytip"; this.tip.hidden = true;
    document.body.append(this.tip);
    body.addEventListener("pointerover", (e) => this.showTip((e.target as HTMLElement).closest<HTMLElement>("[data-tip]")));
    body.addEventListener("pointerleave", () => this.showTip(null));
    body.addEventListener("scroll", () => this.showTip(null), { passive: true });
    // folded away to start with on a small screen, unless it's been opened before
    let folded: string | null = null;
    try { folded = localStorage.getItem(FOLD_KEY); } catch { /* ignore */ }
    this.fold(folded === null ? innerWidth < 700 || innerHeight < 500 : folded === "1", false);
    changed(this.off);
  }

  private fold(folded: boolean, keep = true) {
    this.el.classList.toggle("folded", folded);
    this.el.querySelector(".keyhead")!.setAttribute("aria-expanded", String(!folded));
    if (keep) try { localStorage.setItem(FOLD_KEY, folded ? "1" : "0"); } catch { /* private window: just this visit */ }
  }

  private toggle(layer: string, row: HTMLElement) {
    if (this.off.has(layer)) this.off.delete(layer); else this.off.add(layer);
    row.setAttribute("aria-pressed", String(!this.off.has(layer)));
    try { localStorage.setItem(OFF_KEY, JSON.stringify([...this.off])); } catch { /* private window: just this visit */ }
    this.changed(this.off);
  }

  /** The key's button at page point (x, y), if there is one. */
  private at(x: number, y: number): HTMLButtonElement | null {
    const hit = document.elementFromPoint(x, y)?.closest("button");
    return hit && this.el.contains(hit) ? hit : null;
  }

  /** The crosshair is at page point (x, y): light up the row under it. */
  pointAt(x: number, y: number) {
    const b = this.at(x, y);
    if (b === this.lit) return;
    this.lit?.classList.remove("lit");
    b?.classList.add("lit");
    this.lit = b;
    this.showTip(b);
  }

  /** Puts row's note (if it has one) just to the right of the key, level with the row; null hides it. */
  private showTip(row: HTMLElement | null) {
    const text = row?.dataset.tip;
    if (!row || !text || !row.offsetParent) { this.tip.hidden = true; return; }
    this.tip.textContent = text;
    this.tip.hidden = false;
    const k = this.el.getBoundingClientRect(), r = row.getBoundingClientRect();
    this.tip.style.left = `${Math.min(k.right + 6, innerWidth - this.tip.offsetWidth - 4)}px`;
    this.tip.style.top = `${Math.max(4, Math.min(r.top, innerHeight - this.tip.offsetHeight - 4))}px`;
  }

  /** The map's closed: no note left hanging. */
  hideTip() { this.showTip(null); }

  /** The key's box on the page. */
  rect() { return this.el.getBoundingClientRect(); }

  /** A click with the crosshair at page point (x, y): presses the key's button there, if any. */
  clickAt(x: number, y: number): boolean {
    const b = this.at(x, y);
    b?.click();
    return !!b;
  }
}
