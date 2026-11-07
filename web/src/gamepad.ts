// Game controllers: a PS5 pad over Bluetooth, an Xbox pad, or anything else the browser sees. Most
// browsers lay a known pad out the standard way; a PlayStation pad the browser passes on as it comes
// (its own button order, the triggers and d-pad as axes) is put into that order here, and anything
// else gets a best guess. Each page is told when a pad comes or goes, so it can say so. The left stick walks (or steers), the right stick looks, the triggers shoot and aim
// (or drive and brake), and the rest stand in for keys, laid out as Call of Duty: Warzone lays them out
// by default so a pad feels familiar: Square reloads on a tap and uses on a hold (a tap is enough when
// there's something to use), Circle crouches on a tap and lies down on a hold, Triangle swaps weapon
// (and gets out of a car). A button can carry one thing on a tap and another on a hold: the tap goes
// when you let go, the hold once it's been held a moment. It's only another way of pressing the same
// keys and buttons: the pad is read each frame, and each page (main.ts, mines/main.ts) says what its
// buttons do as a table of actions (padActions), mostly pressing the keyboard key that does it, so
// nothing in the game knows a pad is there, but for a minigame with buttons of its own (the bells' lanes), which takes them over while it's on (padTake). Which button each control is on, and what the prompts
// call it, comes from the one table of controls (controls.ts). Any action can be moved to another
// button in Settings, kept in this browser. Once the pad is the last thing you touched, the prompts
// name its buttons rather than the keys (ctl in controls.ts), and a key or the mouse puts the keys' names back. Off the game (the menus, the pause screen) the d-pad or left stick moves between the
// buttons, Cross presses one and Circle goes back, as Esc does.
//
// Who decides what: nobody. Like the keyboard, a pad only moves you; what you do goes out as usual.
import type { Player } from "./player";
import { modalUp } from "./modal";
import { B, HOLD_MS, PAD_NAME, keyName, padHooks, type Control, type Where } from "./controls";

export { B, PAD_NAME };

/** What a page lets the pad do while you're playing. */
export interface PadPage {
  /** In the game with nothing over it: the pad plays, rather than going round a menu. */
  playing(): boolean;
  player(): Player | null;
  look(dx: number, dy: number): void;
  /** Driving: the triggers are the pedals, and the left stick only steers. */
  driving(): boolean;
  /** A button pressed or let go. Let-gos come even once you've paused, so nothing's left held down. */
  button(b: number, down: boolean): void;
}

/** Press or let go of a keyboard key, as if typed: the game's own keys do the rest. */
export function key(code: string, down: boolean) {
  dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code, key: code === "Escape" ? "Escape" : code === "Enter" ? "Enter" : "", bubbles: true }));
}
export function tap(code: string) { key(code, true); key(code, false); }
export function mouse(button: number, down: boolean) {
  dispatchEvent(new MouseEvent(down ? "mousedown" : "mouseup", { button, bubbles: true }));
}

const STICK_DEAD = 0.12;    // stick drift on a worn pad stays under this
const TRIGGER_DEAD = 0.06;
const HELD = 0.5;           // a trigger pulled this far counts as pressed
// how fast full right stick turns you, in the mouse's pixels a second (the mouse sensitivity and the
// controller's look speeds scale it): about 4.4 radians a second across, a bit slower up and down
const LOOK_X = 2000, LOOK_Y = 1600;
// held near full for a moment, the turn speeds up, so a full push swings you round quickly while
// small pushes still aim finely
const RAMP_NEAR_FULL = 0.9, RAMP_AFTER = 0.3, RAMP_IN = 0.2, RAMP = 1.6;
const REPEAT_FIRST = 0.4, REPEAT = 0.14;   // seconds before a held d-pad moves on again round a menu

/** The controller settings, kept in this browser like the others (settings.ts). */
const PAD_DEFAULTS = { lookX: 1, lookY: 1, invert: false, invertX: false, boost: true, dead: STICK_DEAD, rumble: true };
type PadSettings = typeof PAD_DEFAULTS;
const PAD_KEYS: Record<keyof PadSettings, string> = {
  lookX: "cd-padlookx", lookY: "cd-padlooky", invert: "cd-padinvert", invertX: "cd-padinvertx", boost: "cd-padboost", dead: "cd-paddead", rumble: "cd-padrumble",
};
const padSet: PadSettings = { ...PAD_DEFAULTS };
for (const k of Object.keys(PAD_KEYS) as (keyof PadSettings)[]) {
  try {
    const v = localStorage.getItem(PAD_KEYS[k]);
    if (v === null) continue;
    if (typeof PAD_DEFAULTS[k] === "boolean") (padSet as Record<string, unknown>)[k] = v === "1";
    else if (Number.isFinite(Number(v))) (padSet as Record<string, unknown>)[k] = Number(v);
  } catch { /* private window: the defaults */ }
}

// each setting's box on the Settings page (and the mines' menu), by id
const PAD_INPUTS: Record<keyof PadSettings, string> = {
  lookX: "pad-lookx", lookY: "pad-looky", invert: "pad-invert", invertX: "pad-invertx", boost: "pad-boost", dead: "pad-dead", rumble: "pad-rumble",
};

function setPad<K extends keyof PadSettings>(k: K, v: PadSettings[K]) {
  padSet[k] = v;
  try { localStorage.setItem(PAD_KEYS[k], typeof v === "boolean" ? (v ? "1" : "0") : String(v)); } catch { /* just this visit */ }
}

function showPadSettings() {
  for (const k of Object.keys(PAD_INPUTS) as (keyof PadSettings)[]) {
    const el = document.getElementById(PAD_INPUTS[k]) as HTMLInputElement | null;
    if (!el) continue;
    if (el.type === "checkbox") el.checked = padSet[k] as boolean; else el.value = String(padSet[k]);
  }
}

/** The controls list on the menu, from the page's table: each control's keys, and its pad button
 *  beside them once a pad's been seen. Rows marked data-ctl in the page are filled in; the rest
 *  (voice, pickups) stay as written. */
function padControlsList() {
  for (const dt of document.querySelectorAll<HTMLElement>(".keys dt[data-ctl]")) {
    const cs = dt.dataset.ctl!.split(" ").map((id) => page.find((c) => c.id === id)).filter((c): c is Control => !!c);
    dt.replaceChildren();
    for (const c of cs) {
      const words = c.say?.keys ? [c.say.keys] : [...(c.keys ?? []).map(keyName), ...(c.mouse !== undefined ? [keyName(`Mouse${c.mouse}`)] : [])];
      for (const w of words) { const k = document.createElement("kbd"); k.textContent = w; dt.append(k, " "); }
    }
    const named = new Set<string>();
    for (const c of cs) {
      const a = actions.find((x) => x.id === c.id);
      const n = a ? label(a, over(a) ? a.where : "foot") : c.say?.pad;
      if (n) named.add(n);
    }
    if (!named.size) continue;
    const span = document.createElement("span");
    span.className = "padkey padsettings";
    span.hidden = !connectedPads().length;
    for (const n of named) { const k = document.createElement("kbd"); k.textContent = n; span.append(k); }
    dt.append(span);
  }
}

/** Wire up the controller settings on this page, wherever their boxes are. */
export function padSettings() {
  // the menus' own buttons, which never move: ✕ presses and ○ goes back
  for (const el of document.querySelectorAll<HTMLElement>("[data-padhint]")) el.textContent = (el.textContent ?? "").replace("{ok}", PAD_NAME[B.cross]).replace("{back}", PAD_NAME[B.circle]);
  padControlsList();
  buttonsList();
  showPadSettings();
  for (const k of Object.keys(PAD_INPUTS) as (keyof PadSettings)[]) {
    const el = document.getElementById(PAD_INPUTS[k]) as HTMLInputElement | null;
    if (!el) continue;
    if (el.type === "checkbox") el.addEventListener("change", () => setPad(k, el.checked as PadSettings[typeof k]));
    else el.addEventListener("input", () => setPad(k, (Number(el.value) || PAD_DEFAULTS[k]) as PadSettings[typeof k]));
  }
}

export function resetPadSettings() {
  for (const k of Object.keys(PAD_DEFAULTS) as (keyof PadSettings)[]) setPad(k, PAD_DEFAULTS[k]);
  showPadSettings();
  resetButtons();
}

/** Radial dead zone, rescaled so the stick still reaches 1. */
function stick(x: number, y: number): [number, number] {
  const m = Math.hypot(x, y), dead = Math.min(0.5, Math.max(0, padSet.dead));
  if (m < dead || m === 0) return [0, 0];
  const n = Math.min(1, (m - dead) / (1 - dead));
  return [(x / m) * n, (y / m) * n];
}

let usedAt = -1e9;
let padIndex = -1;

// ---- the buttons ----------------------------------------------------------------------------

/** A control with a pad button on this page, and what pressing it does. */
export interface PadAction extends Control {
  pad: number;
  where: Where;
  /** For a hold: when this says so, a tap is enough (there's something to use right there). */
  now?: () => boolean;
  run(down: boolean): void;
}
/** What a page's controls do on the pad, by control id: run(down), or that and when a tap is enough for a hold. */
export type PadRuns = Record<string, ((down: boolean) => void) | { run: (down: boolean) => void; now?: () => boolean }>;

// never moved: Options pauses, and the PS button is the browser's
const FIXED = new Set<number>([B.options, B.ps]);

let page: Control[] = [];
let actions: PadAction[] = [];
let bound: Record<string, number> = {};
let bindKey = "";
let context: () => Where = () => "foot";
let listening: PadAction | null = null;

// kept with the buttons you've moved; a list without it was saved under the old layout
const LAYOUT_KEY = "_layout", LAYOUT = "warzone";

/** This page's buttons, from its table of controls (controls.ts) and what each does here; where
 *  they're kept in this browser; and where you are (on foot, at a wheel or helm, in a back seat).
 *  `before` is where any control sat in the layout before Warzone's, for lists kept from then. */
export function padActions(table: Control[], runs: PadRuns, storeAs: string, where: () => Where = () => "foot", before: Record<string, number> = {}) {
  page = table;
  actions = table.filter((c) => c.pad !== undefined && runs[c.id]).map((c) => {
    const r = runs[c.id];
    return { ...c, pad: c.pad!, where: c.where ?? "all", ...(typeof r === "function" ? { run: r } : r) };
  });
  bindKey = storeAs;
  context = where;
  bound = Object.fromEntries(actions.map((a) => [a.id, a.pad]));
  const moved = new Set<string>();
  try {
    const saved = JSON.parse(localStorage.getItem(storeAs) ?? "{}") as Record<string, unknown>;
    // the old lists kept every button, moved or not: one still where the old layout had it wasn't
    // moved, so it takes the new layout's place
    const old = saved[LAYOUT_KEY] !== LAYOUT;
    for (const a of actions) {
      const b = saved[a.id];
      if (typeof b !== "number" || !PAD_NAME[b] || FIXED.has(b) || b === a.pad) continue;
      if (old && b === before[a.id]) continue;
      bound[a.id] = b;
      moved.add(a.id);
    }
  } catch { /* nothing kept, or private window: the defaults */ }
  // a button you moved stays put: anything of the new layout's that would fight it over a button moves off
  for (const a of actions) {
    if (moved.has(a.id) || !actions.some((y) => y !== a && bound[y.id] === bound[a.id] && clashes(a, y))) continue;
    const back = before[a.id];
    bound[a.id] = back !== undefined && !taken(a, back) ? back : freeFor(a, bound[a.id]);
  }
  padHooks((id) => { const a = actions.find((x) => x.id === id); return a ? label(a, over(a) ? a.where : context()) : undefined; }, padInUse);
}

function saveButtons() {
  const kept: Record<string, unknown> = { [LAYOUT_KEY]: LAYOUT };
  for (const a of actions) if (bound[a.id] !== a.pad) kept[a.id] = bound[a.id];
  try { localStorage.setItem(bindKey, JSON.stringify(kept)); } catch { /* just this visit */ }
}

/** A row that takes its button over in a place of its own (a wheel or helm, a back seat). */
const over = (a: PadAction) => a.where === "wheel" || a.where === "back";

/** The rows a button press means now: the rows of the place you're in if it has any on it, else the rest. */
function rowsOn(b: number, here: Where): PadAction[] {
  const on = actions.filter((a) => bound[a.id] === b);
  const own = on.filter((a) => a.where === here && over(a));
  return own.length ? own : on.filter((a) => a.where === "all" || (a.where === "foot" && here !== "wheel"));
}

// a button with a tap and a hold on it, pressed and not yet let go or held long enough to tell
let pending: { b: number; at: number; tap: PadAction; hold: PadAction } | null = null;

/** A button pressed or let go while playing: whatever it's set to do. At the wheel the triggers are
 *  the pedals and do nothing else. Let-gos go to everything on the button, so nothing's left held. */
let taker: ((b: number, down: boolean) => boolean) | null = null;
/** A minigame with buttons of its own while it's on (the bells' lanes) has first go at every press
 *  and let-go: it returns true for one it took. null hands the buttons back. */
export function padTake(fn: typeof taker) { taker = fn; }

export function padPress(b: number, down: boolean) {
  if (taker?.(b, down)) return;
  if (!down) {
    if (pending?.b === b) { const t = pending.tap; pending = null; t.run(true); }
    for (const a of actions) if (bound[a.id] === b) a.run(false);
    return;
  }
  const here = context();
  if (here === "wheel" && (b === B.r2 || b === B.l2)) return;
  const rows = rowsOn(b, here);
  const tapRow = rows.find((x) => !x.hold), holdRow = rows.find((x) => x.hold);
  if (tapRow && holdRow && !holdRow.now?.()) { pending = { b, at: performance.now(), tap: tapRow, hold: holdRow }; return; }
  (holdRow ?? tapRow)?.run(true);
}

/** Once a frame while playing: a button held long enough does its hold. */
function padTick(now: number) {
  if (pending && now - pending.at >= HOLD_MS) { const h = pending.hold; pending = null; h.run(true); }
}

/** A row's button as a prompt names it: "hold □" when a tap of it would do something else. */
function label(a: PadAction, here: Where): string {
  const b = bound[a.id], name = PAD_NAME[b];
  return a.hold && !a.now?.() && rowsOn(b, here).some((x) => !x.hold) ? `hold ${name}` : name;
}

/** The button a key is on, for the old way of naming keys (keyLabel): the row of the place you're in, else the one on foot. */
const padName = (code: string): string | undefined => {
  if (code === "Escape") return PAD_NAME[B.options];
  const has = actions.filter((a) => a.keys?.includes(code) || (a.mouse !== undefined && code === `Mouse${a.mouse}`));
  const here = context(), mine = has.filter((a) => a.where === here && over(a)), plain = has.filter((a) => !over(a));
  const use = mine.length ? mine : plain.length ? plain : has;
  if (!use.length) return undefined;
  return [...new Set(use.map((a) => label(a, over(a) ? a.where : here)))].join("/");
};

/** The Buttons list in Settings: each action and its button. Choose one and press the button to put it on. */
/** Whether two rows can both be live at once: one for everywhere, or both for the same place. */
const together = (a: PadAction, b: PadAction) => a.where === "all" || b.where === "all" || a.where === b.where;

function buttonsList() {
  for (const box of document.querySelectorAll<HTMLElement>(".padbuttons")) {
    box.replaceChildren();
    for (const [head, rows] of [["", actions.filter((a) => !over(a))], ["At the wheel or a helm", actions.filter((a) => a.where === "wheel")], ["In the back seat", actions.filter((a) => a.where === "back")]] as const) {
      if (!rows.length) continue;
      if (head) { const h = document.createElement("p"); h.className = "hint"; h.textContent = head; box.append(h); }
      for (const a of rows) {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "padbind";
        const name = document.createElement("span"), btn = document.createElement("kbd");
        name.textContent = a.name;
        btn.textContent = listening === a ? "Press a button…"
          : a.hold && actions.some((y) => y !== a && bound[y.id] === bound[a.id] && !y.hold && together(a, y)) ? `hold ${PAD_NAME[bound[a.id]]}` : PAD_NAME[bound[a.id]];
        row.append(name, btn);
        row.addEventListener("click", () => { listening = a; buttonsList(); refocus(a.id); });
        row.dataset.act = a.id;
        box.append(row);
      }
    }
    const reset = document.createElement("button");
    reset.type = "button";
    reset.textContent = "Reset to default (Warzone layout)";
    reset.addEventListener("click", () => resetButtons());
    box.append(reset);
  }
}

/** Rebuilding the list loses the pad's place in it: put it back on the row it was on. */
function refocus(id: string) {
  const el = document.querySelector<HTMLElement>(`.padbind[data-act="${id}"]`);
  if (!el) return;
  el.focus({ preventScroll: true });
  el.classList.add("padfocus");
  el.addEventListener("blur", () => el.classList.remove("padfocus"), { once: true });
}

/** Would these two fight over a button? Two taps or two holds on foot, the same in one place of
 *  its own (a wheel, a back seat), or a row of such a place and something still needed there. */
function clashes(x: PadAction, y: PadAction) {
  if (!over(x) && !over(y)) return !!x.hold === !!y.hold;
  if (over(x) && over(y)) return x.where === y.where && !!x.hold === !!y.hold;
  return over(x) ? !!y.live : !!x.live;
}
const taken = (x: PadAction, at: number) => actions.some((y) => y !== x && bound[y.id] === at && clashes(x, y));

/** A button this row can go on without a fight: one nothing's on if there is one. */
function freeFor(x: PadAction, fallback: number): number {
  const free = Object.keys(PAD_NAME).map(Number).filter((i) => !FIXED.has(i) && !taken(x, i));
  return free.find((i) => !actions.some((y) => bound[y.id] === i)) ?? free[0] ?? fallback;
}

/** Put an action on a button; whatever it would clash with there (on foot, or at the wheel) takes
 *  the action's old one, or the first free button if that would clash in turn. */
function assign(a: PadAction, b: number) {
  const old = bound[a.id];
  const displaced = actions.filter((x) => x !== a && bound[x.id] === b && clashes(a, x));
  bound[a.id] = b;
  for (const d of displaced) bound[d.id] = taken(d, old) ? freeFor(d, old) : old;
  saveButtons();
}

function resetButtons() {
  for (const a of actions) bound[a.id] = a.pad;
  listening = null;
  saveButtons();
  buttonsList();
  padControlsList();
}

/** Waiting for the button to put an action on: the next one pressed is it, and Circle (or a key) calls it off. */
function heard(pressed: (i: number) => boolean, count: number): boolean {
  if (!listening) return false;
  for (let i = 0; i < count; i++) {
    if (!pressed(i) || FIXED.has(i) || !PAD_NAME[i]) continue;
    const a = listening;
    listening = null;
    if (i !== B.circle) assign(a, i);
    buttonsList();
    padControlsList();
    refocus(a.id);
    break;
  }
  return true;
}
addEventListener("keydown", (e) => { if (e.isTrusted && listening) { listening = null; buttonsList(); } }, true);

// the last thing touched: a key or the mouse puts the keyboard's names back. The pad's own presses
// come in as made-up key events (key, tap), which the browser marks as not from the person.
let keysAt = 0;
const byHand = (e: Event) => { if (e.isTrusted) keysAt = performance.now(); };
addEventListener("keydown", byHand, true);
addEventListener("mousedown", byHand, true);
addEventListener("wheel", byHand, { capture: true, passive: true });
addEventListener("mousemove", (e) => { if (e.isTrusted && (e.movementX || e.movementY)) keysAt = performance.now(); }, true);

/** The pad, not the keyboard and mouse, was the last thing used. */
export function padInUse() { return usedAt > keysAt; }

/** What a prompt calls a key: the keyboard's name for it, or the pad's button once the pad is in use. */
export function keyLabel(code: string): string {
  return (padInUse() && padName(code)) || keyName(code);
}

// a key named in a prompt: in bold, in brackets, after press or hold, or before "to" or "for"
const LETTER = "[A-Z1-9]";
const WORD = "Space|Shift|Tab|Esc|Left click|Right click|the mouse wheel|the mouse button|Click(?= to)";
const NAMED = new RegExp(
  `<b>(${LETTER}|Space|Shift|Tab|Esc)</b>|\\((${LETTER})\\)|\\b(Press|press|Hold|hold|Tap|tap) (${LETTER})\\b|(^|[\\s(·:.])(${LETTER}) (?=to |for |again)|\\b(${WORD})\\b`, "g");
const WORD_CODE: Record<string, string> = { Esc: "Escape", Shift: "ShiftLeft", "Left click": "Mouse0", Click: "Mouse0", "Right click": "Mouse2", "the mouse wheel": "Wheel", "the mouse button": "Mouse0" };

/** A prompt's keys renamed for the pad when it's the one in use; as it was otherwise. */
export function padText(text: string): string {
  if (!padInUse()) return text;
  const as = (name: string) => padName(WORD_CODE[name] ?? (/^\d$/.test(name) ? `Digit${name}` : name.length === 1 ? `Key${name}` : name)) ?? name;
  return text.replace(NAMED, (_m, bold, bracket, verb, after, lead, before, word) =>
    bold ? `<b>${as(bold)}</b>` : bracket ? `(${as(bracket)})` : verb ? `${verb} ${as(after)}` : before ? `${lead}${as(before)} ` : as(word))
    .replace(/\b(Hold|hold) (<b>)?hold /g, "$1 $2");
}

type Layout = "standard" | "sony" | "guess";
interface Btn { pressed: boolean; value: number }
/** A pad in the standard layout, whatever the browser gave: buttons by B, axes left x, y, right x, y. */
interface Pad { index: number; buttons: Btn[]; axes: number[] }

const SONY_PRODUCTS = new Set(["05c4", "09cc", "0ba0", "0ce6", "0df2"]);
// a PlayStation pad's own order, as Firefox's remapping reads it (dom/gamepad/GamepadRemapping.cpp)
const SONY_BUTTONS = [B.square, B.cross, B.circle, B.triangle, B.l1, B.r1, B.l2, B.r2, B.create, B.options, B.l3, B.r3, B.ps, B.touchpad];

/** Vendor and product, four hex digits each, from Chrome's "(Vendor: 054c Product: 0ce6)" or Firefox's "54c-ce6-". */
function usbIds(id: string): [string, string] | null {
  const m = /Vendor:\s*([0-9a-f]{1,4})\s+Product:\s*([0-9a-f]{1,4})/i.exec(id) ?? /^([0-9a-f]{1,4})-([0-9a-f]{1,4})-/i.exec(id);
  return m ? [m[1].toLowerCase().padStart(4, "0"), m[2].toLowerCase().padStart(4, "0")] : null;
}

function layoutOf(g: Gamepad): Layout {
  if (g.mapping === "standard") return "standard";
  const ids = usbIds(g.id);
  if ((ids && ids[0] === "054c" && SONY_PRODUCTS.has(ids[1])) || /dualsense|dualshock/i.test(g.id)) return "sony";
  return "guess";
}

/** A hat switch read as one axis: -1 is up, going round clockwise to 1 (up and left); released it's past 1. */
function hat(v: number | undefined): [boolean, boolean, boolean, boolean] {
  if (v === undefined || v === 0 || Math.abs(v) > 1.01) return [false, false, false, false];
  return [(v >= -1 && v < -0.7) || v >= 0.95, v >= -0.2 && v < 0.45, v >= 0.4, v >= -0.75 && v < -0.1];
}

/** A hat axis is the one resting past 1, or failing that where the HID usage numbers put it. */
function hatAxis(axes: readonly number[]): number {
  const i = axes.findIndex((a) => Math.abs(a) > 1.01);
  return i >= 0 ? i : axes.length > 9 ? 9 : -1;
}

/** A trigger read as an axis from -1 (let go) to 1. An axis never moved yet reads 0, which isn't half pulled. */
function triggerAxis(a: number | undefined, button: GamepadButton | undefined): Btn {
  const v = a === undefined || a === 0 ? (button?.value ?? 0) : (a + 1) / 2;
  return { pressed: (button?.pressed ?? false) || v > HELD, value: v };
}

function standardise(g: Gamepad, layout: Layout): Pad {
  if (layout === "standard") return { index: g.index, buttons: [...g.buttons], axes: [...g.axes] };
  const buttons: Btn[] = Array.from({ length: 18 }, () => ({ pressed: false, value: 0 }));
  const ax = g.axes;
  let axes: number[];
  if (layout === "sony") {
    SONY_BUTTONS.forEach((to, from) => { const b = g.buttons[from]; if (b) buttons[to] = { pressed: b.pressed, value: b.value }; });
    buttons[B.l2] = triggerAxis(ax[3], g.buttons[6]);
    buttons[B.r2] = triggerAxis(ax[4], g.buttons[7]);
    axes = [ax[0] ?? 0, ax[1] ?? 0, ax[2] ?? 0, ax[5] ?? 0];
  } else {
    g.buttons.forEach((b, i) => { if (i < 18) buttons[i] = { pressed: b.pressed, value: b.value }; });
    const ry = ax.length >= 6 ? 5 : 3;
    axes = [ax[0] ?? 0, ax[1] ?? 0, ax[2] ?? 0, ax[ry] ?? 0];
  }
  const h = hatAxis(ax);
  if (h >= 0) {
    const [up, down, left, right] = hat(ax[h]);
    if (up) buttons[B.up] = { pressed: true, value: 1 };
    if (down) buttons[B.down] = { pressed: true, value: 1 };
    if (left) buttons[B.left] = { pressed: true, value: 1 };
    if (right) buttons[B.right] = { pressed: true, value: 1 };
  }
  return { index: g.index, buttons, axes };
}

function connectedPads(): Gamepad[] {
  try { return [...(navigator.getGamepads?.() ?? [])].filter((g): g is Gamepad => !!g?.connected); } catch { return []; }
}

/** For the debug panel: every pad the browser shows, how it's read, and what's held on it now. */
export function padReport(): string[] {
  const pads = connectedPads();
  if (!pads.length) return ["none seen yet: press a button on it with this page in front"];
  return pads.map((g) => {
    const held = g.buttons.map((b, i) => (b.pressed ? String(i) : b.value > 0.05 ? `${i}:${b.value.toFixed(2)}` : "")).filter(Boolean).join(" ");
    return `#${g.index}${g.index === padIndex ? " (in use)" : ""} "${g.id}" mapping "${g.mapping}" read as ${layoutOf(g)}\n`
      + `   buttons ${g.buttons.length} held [${held}]  axes ${g.axes.map((a) => a.toFixed(2)).join(" ")}`;
  });
}

/** Under the controls on the menu: whether a pad's been seen, since a browser hides one until a button's pressed. */
function showNote(text: string) {
  const el = document.getElementById("padnote");
  if (el) el.textContent = text;
}

/** A short buzz, if a pad's being played with and can: firing is light, being hit heavier. */
export function rumble(strong: number, weak: number, ms: number) {
  if (!padSet.rumble || performance.now() - usedAt > 20000 || padIndex < 0) return;
  try {
    const p = navigator.getGamepads?.()[padIndex] as (Gamepad & { vibrationActuator?: { playEffect?: (t: string, o: object) => Promise<unknown> } }) | null;
    p?.vibrationActuator?.playEffect?.("dual-rumble", { duration: ms, strongMagnitude: strong, weakMagnitude: weak })?.catch?.(() => {});
  } catch { /* no rumble here */ }
}

export class GamepadControls {
  private was: boolean[] = [];
  private movedJoy = false;
  private navT = 0;
  private navDir = -1;
  private focused: HTMLElement | null = null;
  private seen = new Map<number, string>();
  private fullT = 0;

  /** `say` puts up a short note, such as a pad coming or going. */
  constructor(private page: () => PadPage | null, private say: (text: string) => void = () => {}) {
    addEventListener("gamepadconnected", () => this.check());
    addEventListener("gamepaddisconnected", () => this.check());
  }

  /** Notice pads coming and going: the events, and every frame too, as not every browser sends them. */
  private check(pads = connectedPads()) {
    const now = new Map(pads.map((g) => [g.index, g.id]));
    if (now.size !== this.seen.size || pads.some((g) => this.seen.get(g.index) !== g.id)) {
      for (const el of document.querySelectorAll<HTMLElement>(".padsettings")) el.hidden = !pads.length;
    }
    for (const g of pads) {
      if (this.seen.get(g.index) === g.id) continue;
      const odd = layoutOf(g) === "guess";
      this.say(odd ? "Controller seen, but this browser lays it out oddly: some buttons may be muddled" : "Controller connected");
      showNote(odd ? `Seen, laid out oddly (${g.id.slice(0, 40)}): some buttons may be muddled` : `Connected: ${g.id.slice(0, 40)}`);
    }
    for (const i of this.seen.keys()) {
      if (now.has(i)) continue;
      this.say("Controller disconnected");
      showNote(now.size ? "Connected" : "Press a button on your controller to wake it up");
    }
    this.seen = now;
  }

  /** Read the pad and act on it: once a frame. */
  poll(dt: number) {
    const pad = this.pick();
    if (!pad) return;
    const now = performance.now();
    const btn = (i: number) => pad.buttons[i]?.pressed ?? false;
    const val = (i: number) => pad.buttons[i]?.value ?? 0;
    const down: boolean[] = pad.buttons.map((b, i) => b.pressed || ((i === B.l2 || i === B.r2) && b.value > HELD));
    const ax = pad.axes;
    if (down.some(Boolean) || ax.some((a) => Math.abs(a) > 0.3)) usedAt = now;

    const pressed = (i: number) => down[i] && !this.was[i];
    if (heard(pressed, down.length)) { this.was = down; return; }
    const page = this.page();
    const playing = !!page?.playing();
    for (let i = 0; i < down.length; i++) if (!down[i] && this.was[i]) page?.button(i, false);

    const p = page?.player() ?? null;
    if (playing && page && p) {
      this.unfocus();
      let [mx, my] = stick(ax[0] ?? 0, ax[1] ?? 0);
      if (page.driving()) {
        const r = val(B.r2), l = val(B.l2);
        if (r > TRIGGER_DEAD || l > TRIGGER_DEAD) my = l - r;
      }
      if (mx || my) { p.joy.x = mx; p.joy.y = my; this.movedJoy = p.padStick = true; }
      else if (this.movedJoy) { p.joy.x = p.joy.y = 0; this.movedJoy = p.padStick = p.sprintLatch = false; }
      const [lx, ly] = stick(ax[2] ?? 0, ax[3] ?? 0);
      const m = Math.hypot(lx, ly);
      this.fullT = m >= RAMP_NEAR_FULL ? this.fullT + dt : 0;
      if (m) {
        const ramp = padSet.boost ? 1 + (RAMP - 1) * Math.min(1, Math.max(0, (this.fullT - RAMP_AFTER) / RAMP_IN)) : 1;
        // squared, so small pushes aim finely and a full push still turns quickly
        const k = m * dt * ramp;
        page.look(lx * k * LOOK_X * padSet.lookX * (padSet.invertX ? -1 : 1), ly * k * LOOK_Y * padSet.lookY * (padSet.invert ? -1 : 1));
      }
      if (pressed(B.options)) {
        // as Esc does: letting go of the mouse is what pauses a game played with it captured
        // (a big card up is put away first, as Esc does: modal.ts)
        if (document.pointerLockElement && !modalUp()) document.exitPointerLock(); else tap("Escape");
      }
      for (let i = 0; i < down.length; i++) if (pressed(i) && i !== B.options) page.button(i, true);
      padTick(now);
    } else {
      pending = null;
      if (this.movedJoy && p) { p.joy.x = p.joy.y = 0; }
      this.movedJoy = false;
      this.menus(pad, down, dt, btn);
    }
    this.was = down;
  }

  /** The pad to play with: one laid out the standard way, else one we know, else any. */
  private pick(): Pad | null {
    const pads = connectedPads();
    this.check(pads);
    let best: Gamepad | null = null, bestRank = 9;
    const RANK: Record<Layout, number> = { standard: 0, sony: 1, guess: 2 };
    for (const g of pads) { const r = RANK[layoutOf(g)]; if (r < bestRank) { best = g; bestRank = r; } }
    padIndex = best ? best.index : -1;
    return best ? standardise(best, layoutOf(best)) : null;
  }

  // ---- off the game: round the menu's buttons -------------------------------------------------

  private menus(pad: Pad, down: boolean[], dt: number, btn: (i: number) => boolean) {
    const pressed = (i: number) => down[i] && !this.was[i];
    const [sx, sy] = stick(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
    const dir = btn(B.up) || sy < -0.6 ? 0 : btn(B.down) || sy > 0.6 ? 1 : btn(B.left) || sx < -0.6 ? 2 : btn(B.right) || sx > 0.6 ? 3 : -1;
    let step = -1;
    if (dir !== this.navDir) { this.navDir = dir; this.navT = REPEAT_FIRST; step = dir; }
    else if (dir >= 0 && (this.navT -= dt) <= 0) { this.navT = REPEAT; step = dir; }

    if (pressed(B.circle)) { tap("Escape"); return; }
    if (pressed(B.options)) {
      const resume = document.getElementById("resume");
      if (resume && visible(resume) && top() === resume.closest(".overlay")) resume.click();
      return;
    }
    if (step >= 0) this.move(step);
    if (pressed(B.cross)) this.press();
  }

  private move(dir: number) {
    const cur = this.current();
    if (cur && (dir === 2 || dir === 3) && this.adjust(cur, dir === 3 ? 1 : -1)) return;
    const all = targets();
    if (!all.length) return;
    if (!cur || !all.includes(cur)) { this.focus(all.find((e) => e.classList.contains("primary")) ?? all[0]); return; }
    const a = cur.getBoundingClientRect();
    const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best: HTMLElement | null = null, bestScore = Infinity;
    for (const e of all) {
      if (e === cur) continue;
      const r = e.getBoundingClientRect();
      const dx = r.left + r.width / 2 - ax, dy = r.top + r.height / 2 - ay;
      if ((dir === 0 ? -dy : dir === 1 ? dy : dir === 2 ? -dx : dx) <= 2) continue;
      // edge to edge, so the tickbox just below a wide box comes before a button lined up further down
      const gap = Math.max(0, dir === 0 ? a.top - r.bottom : dir === 1 ? r.top - a.bottom : dir === 2 ? a.left - r.right : r.left - a.right);
      const off = dir < 2 ? Math.max(0, r.left - a.right, a.left - r.right) : Math.max(0, r.top - a.bottom, a.top - r.bottom);
      const score = gap + off * 2 + (dir < 2 ? Math.abs(dx) : Math.abs(dy)) * 0.1;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    if (best) this.focus(best);
  }

  /** Left and right on a slider or a drop-down change it rather than moving off it. */
  private adjust(el: HTMLElement, by: number): boolean {
    if (el instanceof HTMLInputElement && el.type === "range") {
      if (by > 0) el.stepUp(); else el.stepDown();
    } else if (el instanceof HTMLSelectElement) {
      const i = Math.max(0, Math.min(el.options.length - 1, el.selectedIndex + by));
      if (i === el.selectedIndex) return true;
      el.selectedIndex = i;
    } else return false;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  private press() {
    const all = targets();
    const cur = this.current();
    if (!cur || !all.includes(cur)) { if (all.length) this.focus(all.find((e) => e.classList.contains("primary")) ?? all[0]); return; }
    // in a text box, Cross is Enter: the game name's box starts the game
    if (cur instanceof HTMLInputElement && (cur.type === "text" || cur.type === "")) {
      cur.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
      return;
    }
    cur.click();
  }

  private current(): HTMLElement | null {
    const a = document.activeElement;
    return a instanceof HTMLElement && a !== document.body ? a : null;
  }

  private focus(el: HTMLElement) {
    this.unfocus();
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "nearest" });
    el.classList.add("padfocus");
    el.addEventListener("blur", () => el.classList.remove("padfocus"), { once: true });
    this.focused = el;
  }

  private unfocus() {
    this.focused?.classList.remove("padfocus");
    this.focused = null;
  }
}

function visible(e: HTMLElement) {
  return e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden";
}

/** The menu on top: the visible overlay drawn over the others. */
function top(): HTMLElement | null {
  let best: HTMLElement | null = null, z = -Infinity;
  for (const o of document.querySelectorAll<HTMLElement>(".overlay")) {
    if (!visible(o)) continue;
    const oz = Number(getComputedStyle(o).zIndex) || 0;
    if (oz >= z) { z = oz; best = o; }
  }
  return best;
}

/** What the pad can move between: the top menu's buttons and boxes, or the whole page's if there's no menu. */
function targets(): HTMLElement[] {
  const sel = "button, input, select, a[href], [tabindex]:not([tabindex='-1'])";
  const scope = top() ?? document.body;
  return [...scope.querySelectorAll<HTMLElement>(sel)].filter((e) => !(e as HTMLButtonElement).disabled && visible(e));
}
