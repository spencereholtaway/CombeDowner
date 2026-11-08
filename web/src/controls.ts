// Every control in the game in one place: what it does, its keys and mouse button, its button on a
// game controller (Call of Duty: Warzone's default layout), and its word on a touch screen. Prompts
// name controls, never keys: ctl("use") gives "E", "□" or "Use" by whichever was touched last (the
// keyboard, the pad or the screen), and ctlText("{use} Get in") does the same for a whole line.
// The pad's buttons (gamepad.ts), the Buttons list in Settings, the Controls list on the menu and the
// minigames' control strips all come from these tables.
//
// Few controls, and the context decides what they do. In the normal world one button does everything
// you interact with: use (E, □, Use) gets you in a car, takes the call on Push the Bus,
// goes again after a race, lets go of a lock beam, cuffs, shouts at gulls, votes for a painting; when
// two things are near, it's the one the prompt names. A hold of use only where a tap of it already
// means something else there. Separate buttons are for
// what's held or steered: moving, the pedals, jump, crouch and prone, sprint, aim, shoot, reload,
// weapons, the horn (at a car's wheel or a narrowboat's helm, where it's the bell), the map, the
// radio, marking, the torch, binoculars and getting on or off a ride. Minigames whose play is quite
// different (the easel, the bell chamber, the Climb, the tightrope, the Driving Test's
// back seat, the big map and a pub's card on it) have their own table here, and show it as a strip while
// you're in them (strip).
//
// Who decides what: nobody. It's only names and buttons; what a control does stays where it always was.

/** The standard layout's buttons, named the PlayStation way. */
export const B = {
  cross: 0, circle: 1, square: 2, triangle: 3, l1: 4, r1: 5, l2: 6, r2: 7,
  create: 8, options: 9, l3: 10, r3: 11, up: 12, down: 13, left: 14, right: 15, ps: 16, touchpad: 17,
} as const;

/** The PlayStation names, in letters the HUD's font has. */
export const PAD_NAME: Record<number, string> = {
  [B.cross]: "✕", [B.circle]: "○", [B.square]: "□", [B.triangle]: "△", [B.l1]: "L1", [B.r1]: "R1", [B.l2]: "L2", [B.r2]: "R2",
  [B.create]: "Create", [B.options]: "Options", [B.l3]: "L3", [B.r3]: "R3",
  [B.up]: "d-pad ↑", [B.down]: "d-pad ↓", [B.left]: "d-pad ←", [B.right]: "d-pad →", [B.touchpad]: "Touchpad",
};

/** Where a control counts: everywhere, only on foot, only at a wheel or helm, or in one place's own controls. */
export type Where = "all" | "foot" | "wheel" | "back";

export interface Control {
  id: string;
  /** What it does, for the lists. */
  name: string;
  /** Key codes that do it; the first is the one prompts name. */
  keys?: string[];
  /** A mouse button that does it (0 left, 1 middle, 2 right). */
  mouse?: number;
  /** Its button on a pad, in the Warzone layout, if it has one of its own. */
  pad?: number;
  /** On the pad it's taken by holding its button, which a tap does something else with. */
  hold?: boolean;
  /** Its word on a touch screen. */
  touch?: string;
  where?: Where;
  /** Still wanted at the wheel (getting out, the radio, the map, the scores): no driving row may take its button. */
  live?: boolean;
  /** On a pad and a touch screen it's another control's button: this names that one. */
  via?: string;
  /** Wording of its own for each input, for the sticks and the like ("left stick ↑"). */
  say?: { keys?: string; pad?: string; touch?: string };
}

const STICK = (keys: string, pad: string, touch: string) => ({ keys, pad, touch });

/** The streets. */
export const STREETS: Control[] = [
  { id: "move", name: "Move", keys: ["KeyW"], say: STICK("W A S D", "Left stick", "the stick") },
  { id: "forward", name: "Forward", keys: ["KeyW"], say: STICK("W", "left stick ↑", "stick ↑") },
  { id: "back", name: "Back", keys: ["KeyS"], say: STICK("S", "left stick ↓", "stick ↓") },
  { id: "strafeleft", name: "Left", keys: ["KeyA"], say: STICK("A", "left stick ←", "stick ←") },
  { id: "straferight", name: "Right", keys: ["KeyD"], say: STICK("D", "left stick →", "stick →") },
  { id: "steer", name: "Steer", keys: ["KeyA", "KeyD"], say: STICK("A/D", "left stick", "the stick") },
  { id: "throttle", name: "Throttle", keys: ["KeyW", "KeyS"], say: STICK("W/S", "left stick ↑↓", "stick ↑↓") },
  { id: "look", name: "Look", say: STICK("the mouse", "right stick", "drag") },
  { id: "fire", name: "Shoot", mouse: 0, pad: B.r2, touch: "Fire", where: "foot" },
  { id: "aim", name: "Aim", mouse: 2, pad: B.l2, touch: "Aim", where: "foot" },
  // with no mouse captured (an iPad's keyboard, or a touch screen with a keyboard), the arrows look
  // round instead of walking, and these two shoot and aim
  { id: "keylook", name: "Look, with no mouse", keys: ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"], say: { keys: "← → ↑ ↓" } },
  { id: "keyfire", name: "Shoot, with no mouse", keys: ["Enter"], via: "fire", where: "foot" },
  { id: "keyaim", name: "Aim, with no mouse", keys: ["Slash"], via: "aim", where: "foot" },
  { id: "mouseaim", name: "Aim with a tablet's trackpad, or drag to look", keys: ["Backquote"], say: { pad: "the ` key", touch: "the ` key" } },
  { id: "jump", name: "Jump, or the handbrake", keys: ["Space"], pad: B.cross, touch: "Jump" },
  { id: "reload", name: "Reload", keys: ["KeyR"], pad: B.square, touch: "Reload", where: "foot" },
  { id: "use", name: "Use, get in or out", keys: ["KeyE"], pad: B.square, hold: true, touch: "Use", live: true },
  { id: "crouch", name: "Crouch, or stand up", keys: ["KeyC"], pad: B.circle, touch: "Crouch", where: "foot" },
  { id: "prone", name: "Lie down, or stand up", keys: ["KeyZ"], pad: B.circle, hold: true, touch: "Crouch twice", where: "foot" },
  { id: "swap", name: "Switch weapon", keys: ["KeyQ"], pad: B.triangle, touch: "Weapon", where: "foot" },
  { id: "prev", name: "Previous weapon (or a minibus)", keys: ["Digit1"], pad: B.l1, touch: "Weapon", where: "foot" },
  { id: "next", name: "Next weapon (or a double-decker)", keys: ["Digit2"], pad: B.r1, touch: "Weapon", where: "foot" },
  { id: "fists", name: "Fists", keys: ["Digit1"], via: "swap" },
  { id: "rifle", name: "Rifle", keys: ["Digit2"], via: "swap" },
  { id: "sniper", name: "Sniper rifle", keys: ["Digit3"], via: "swap" },
  { id: "minibus", name: "Call the minibus", keys: ["Digit1"], via: "prev", say: { touch: "Minibus" } },
  { id: "bus", name: "Call the double-decker", keys: ["Digit2"], via: "next", say: { touch: "Double-decker" } },
  { id: "trick", name: "Sprint, or trick or grind on a ride", keys: ["ShiftLeft"], pad: B.l3, touch: "Trick" },
  { id: "sprint", name: "Sprint", keys: ["ShiftLeft"], via: "trick", say: { touch: "the stick pushed right up" } },
  { id: "radio", name: "Talk on the radio", keys: ["KeyV"], pad: B.r3, touch: "Radio", live: true },
  { id: "scores", name: "Scores", keys: ["Tab"], pad: B.create, live: true },
  { id: "map", name: "Full map", keys: ["KeyM"], pad: B.touchpad, touch: "the minimap", live: true },
  { id: "torch", name: "Torch", keys: ["KeyF"], pad: B.up, touch: "Torch" },
  { id: "ride", name: "On or off a ride, put up a ladder", keys: ["KeyX"], pad: B.down, touch: "Ride" },
  { id: "bino", name: "Binoculars", keys: ["KeyB"], pad: B.left, touch: "Bino", where: "foot" },
  { id: "job", name: "See the job's poster again", keys: ["KeyJ"], pad: B.touchpad, hold: true, touch: "Poster" },
  { id: "mark", name: "Mark the spot", keys: ["KeyG"], mouse: 1, pad: B.right, where: "foot" },
  { id: "pause", name: "Pause", keys: ["Escape"], pad: B.options, touch: "II" },
  { id: "music", name: "Previous and next music track", keys: ["Comma", "Period"] },
  // purposes that are another control's in their own place
  { id: "heave", name: "Heave (Push the Bus)", keys: ["Space"], via: "jump", say: { touch: "Heave" } },
  { id: "kick", name: "Kick or bowl, lined up at a ball", keys: ["Space"], via: "jump", say: { touch: "Fire" } },
  { id: "walkoff", name: "Walk off from a ball", keys: ["KeyE"], via: "use", say: { touch: "Jump" } },
  { id: "dive", name: "Dive, in goal", keys: ["Space"], via: "jump", say: { touch: "Dive" } },
  { id: "burner", name: "A balloon's burner", keys: ["KeyW"], say: STICK("W", "left stick ↑", "stick ↑") },
  { id: "vent", name: "A balloon's vent", keys: ["KeyS"], say: STICK("S", "left stick ↓", "stick ↓") },
  { id: "climbup", name: "Climb a ladder", keys: ["KeyW"], say: STICK("W", "left stick ↑", "stick ↑") },
  { id: "climbdown", name: "Down a ladder", keys: ["KeyS"], say: STICK("S", "left stick ↓", "stick ↓") },
  { id: "letgo", name: "Let go of a ladder", keys: ["Space"], via: "jump" },
  { id: "again", name: "Go again (a race)", keys: ["KeyE", "Backspace"], via: "use", say: { touch: "Again" } },
  { id: "watch", name: "Watch someone else (out of a race)", keys: ["KeyQ", "KeyE"], say: { keys: "Q / E", pad: "d-pad ← →", touch: "◀ ▶" } },
  // at a car's wheel, or a narrowboat's helm
  { id: "drive", name: "Drive", keys: ["KeyW"], say: STICK("W", PAD_NAME[B.r2], "stick ↑") },
  { id: "brake", name: "Brake and reverse", keys: ["KeyS"], say: STICK("S", PAD_NAME[B.l2], "stick ↓") },
  { id: "handbrake", name: "Handbrake", keys: ["Space"], via: "jump", say: { touch: "Jump" } },
  { id: "out", name: "Get out", keys: ["KeyE"], pad: B.triangle, touch: "Get out", where: "wheel" },
  { id: "horn", name: "Horn, bell, siren or chimes", keys: ["KeyH"], pad: B.r1, touch: "Fire", where: "wheel" },
  { id: "view", name: "Chase, seat or bonnet camera", keys: ["KeyC"], pad: B.circle, touch: "View", where: "wheel" },
  { id: "left", name: "Indicate left", keys: ["ArrowLeft"], pad: B.left, touch: "◀", where: "wheel" },
  { id: "right", name: "Indicate right", keys: ["ArrowRight"], pad: B.right, touch: "▶", where: "wheel" },
  // in the back of the Driving Test's car, where the d-pad's uses on foot don't apply
  { id: "radioup", name: "Radio up", keys: ["KeyK"], pad: B.up, touch: "Radio up", where: "back" },
  { id: "radiodown", name: "Radio down", keys: ["KeyJ"], pad: B.down, touch: "Radio down", where: "back" },
  { id: "station", name: "Change station", keys: ["KeyI"], pad: B.left, touch: "Change station", where: "back" },
  { id: "window", name: "Window", keys: ["KeyU"], pad: B.right, touch: "Window", where: "back" },
];

/** Down the mines. */
export const MINES: Control[] = [
  { id: "move", name: "Move", keys: ["KeyW"], say: STICK("W A S D", "Left stick", "the stick") },
  { id: "look", name: "Look", say: STICK("the mouse", "right stick", "drag") },
  { id: "fire", name: "Swing, draw or cast", mouse: 0, pad: B.r2, touch: "Fire" },
  { id: "heal", name: "Healing light", mouse: 2, pad: B.l2, touch: "Heal" },
  { id: "jump", name: "Jump", keys: ["Space"], pad: B.cross, touch: "Jump" },
  { id: "use", name: "Use, or hold to pick a friend up", keys: ["KeyE"], pad: B.square, touch: "Use" },
  { id: "crouch", name: "Crouch", keys: ["KeyC"], pad: B.circle, touch: "Crouch" },
  { id: "prev", name: "Previous weapon", keys: ["Wheel"], pad: B.l1 },
  { id: "next", name: "Next weapon", keys: ["Wheel"], pad: B.r1 },
  { id: "swap", name: "Switch weapon", keys: ["Wheel"], pad: B.triangle, touch: "Weapon" },
  { id: "sprint", name: "Sprint", keys: ["ShiftLeft"], pad: B.l3 },
  { id: "radio", name: "Talk on the radio", keys: ["KeyV"], pad: B.r3, touch: "Radio" },
  { id: "map", name: "Whole map", keys: ["KeyM"], pad: B.touchpad, touch: "Map" },
  { id: "slot1", name: "First weapon", keys: ["Digit1"], pad: B.up },
  { id: "slot2", name: "Second weapon", keys: ["Digit2"], pad: B.down },
  { id: "slot3", name: "Third weapon", keys: ["Digit3"], pad: B.left },
  { id: "slot4", name: "Fourth weapon", keys: ["Digit4"], pad: B.right },
  { id: "pause", name: "Pause", keys: ["Escape"], pad: B.options, touch: "II" },
];

/** Minigames and screens with controls of their own: each shows its table as a strip while it's up. */
export const PLACES: Record<string, Control[]> = {
  // the big map, open over the game
  map: [
    { id: "map.mark", name: "mark", mouse: 0, keys: ["KeyG"], pad: B.cross, say: { keys: "Click", touch: "Tap" } },
    { id: "map.cursor", name: "move the cursor", say: { pad: "Left stick" } },
    { id: "map.pan", name: "move", keys: ["KeyW", "KeyA", "KeyS", "KeyD"], say: STICK("Drag or WASD", "", "Drag") },
    { id: "map.zoom", name: "zoom", say: STICK("Wheel or +/−", `${PAD_NAME[B.r2]}/${PAD_NAME[B.l2]} or right stick`, "Pinch") },
    { id: "map.find", name: "find yourself", keys: ["Space", "KeyC"], pad: B.triangle },
    { id: "map.close", name: "close", keys: ["KeyM", "Escape"], pad: B.circle, say: { keys: "M or Esc", touch: "Close map" } },
  ],
  // the card a pub on the big map opens: its buttons are tapped or clicked, and these do the same
  pubcard: [
    { id: "pubcard.go", name: "go there", keys: ["KeyE", "Enter"], pad: B.cross, say: { touch: "" } },
    { id: "pubcard.mark", name: "mark it", keys: ["KeyG"], pad: B.square, say: { touch: "" } },
    { id: "pubcard.back", name: "back", keys: ["Escape"], pad: B.circle, say: { touch: "" } },
  ],
  // a big card over the game (a mission's end, a race's results, a bounty's poster: modal.ts)
  card: [
    { id: "card.close", name: "close", keys: ["Escape"], pad: B.options, touch: "×" },
    // a job or challenge lost: its card offers another go or leaving it there; on a touch screen the buttons are tapped
    { id: "card.retry", name: "retry", keys: ["KeyR", "Enter"], pad: B.square, touch: "" },
    { id: "card.abort", name: "abort", keys: ["Escape"], pad: B.options, touch: "" },
  ],
  // the bells' ringing chamber: the note highway's four lanes, laid out as the keys and the face
  // buttons sit, left to right (a chord is two at once); use looks to before the ringing
  bells: [
    { id: "bells.lane1", name: "ring the left lane", keys: ["KeyA"], pad: B.square, touch: "its pad" },
    { id: "bells.lane2", name: "ring the second lane", keys: ["KeyW"], pad: B.triangle, touch: "its pad" },
    { id: "bells.lane3", name: "ring the third lane", keys: ["KeyS"], pad: B.cross, touch: "its pad" },
    { id: "bells.lane4", name: "ring the right lane", keys: ["KeyD"], pad: B.circle, touch: "its pad" },
    { id: "bells.look", name: "look to now", keys: ["KeyE"], via: "use" },
  ],
  // the Climb: hanging on a hold or a rope
  climb: [
    { id: "climb.reach", name: "reach", say: STICK("W A S D", "left stick", "the stick") },
    { id: "climb.rope", name: "up or down the rope", say: STICK("W/S", "left stick ↑↓", "stick ↑↓") },
    { id: "climb.lunge", name: "lunge", keys: ["Space"], via: "jump" },
    { id: "climb.letgo", name: "let go", keys: ["KeyC"], via: "crouch" },
  ],
  // the tightrope: walking it, and flying a balloon at one end
  rope: [
    { id: "rope.lean", name: "lean", keys: ["KeyA", "KeyD"], say: STICK("A D", "left stick ←→", "stick ←→") },
    { id: "rope.walk", name: "walk", keys: ["KeyW"], say: STICK("W", "left stick ↑", "stick ↑") },
    { id: "rope.in", name: "pull in", keys: ["KeyW"], say: STICK("W", "left stick ↑", "stick ↑") },
    { id: "rope.out", name: "let out", keys: ["KeyS"], say: STICK("S", "left stick ↓", "stick ↓") },
  ],
  // the art gallery's easel: a pad has no pointer to paint with, so it goes round the buttons as in a menu
  easel: [
    { id: "easel.paint", name: "paint", mouse: 0, say: { keys: "Click and drag", touch: "Drag" } },
    { id: "easel.second", name: "in the second colour", mouse: 2 },
    { id: "easel.buttons", name: "pick a tool or colour", say: { pad: `d-pad, ${PAD_NAME[B.cross]}` } },
    { id: "easel.undo", name: "undo", say: { keys: "Ctrl+Z" } },
    { id: "easel.leave", name: "step back", keys: ["Escape"], pad: B.circle, touch: "×" },
  ],
};

// ---- naming them --------------------------------------------------------------------------------

const KEY_NAME: Record<string, string> = {
  Space: "Space", Tab: "Tab", Escape: "Esc", ShiftLeft: "Shift", Enter: "Enter", Backspace: "Backspace", Wheel: "the mouse wheel",
  ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓", Comma: ",", Period: ".", Slash: "/", Backquote: "`",
  Mouse0: "Left click", Mouse1: "Middle click", Mouse2: "Right click",
};
/** A key code as the keyboard prints it. */
export const keyName = (code: string) => KEY_NAME[code] ?? code.replace(/^(Key|Digit)/, "");

let page: Control[] = STREETS;
const byId = new Map<string, Control>();
function index() {
  byId.clear();
  for (const t of Object.values(PLACES)) for (const c of t) byId.set(c.id, c);
  for (const c of page) byId.set(c.id, c);
}
index();

/** Which page's table the bare names (use, jump) mean: the streets' or the mines'. */
export function controlsPage(t: Control[]) { page = t; index(); }
export const control = (id: string) => byId.get(id);

/** How the player's playing: whichever they touched last. */
export type Input = "keys" | "pad" | "touch";
let padLabel: (id: string) => string | undefined = () => undefined;
let padOn = () => false;
/** gamepad.ts tells us the pad's buttons as they're bound now, and whether it's the one in use. */
export function padHooks(label: typeof padLabel, inUse: () => boolean) { padLabel = label; padOn = inUse; }
const touchOn = () => { const t = typeof document !== "undefined" ? document.getElementById("touch") : null; return !!t && !t.hidden; };
export function input(): Input { return touchOn() ? "touch" : padOn() ? "pad" : "keys"; }

/** What a prompt calls a control, for the input in use now. */
export function ctl(id: string, as: Input = input()): string {
  const c = byId.get(id);
  if (!c) return id;
  if (c.say?.[as]) return c.say[as]!;
  if (as === "touch") return c.touch ?? (c.via ? ctl(c.via, as) : ctl(id, "keys"));
  if (as === "pad") return padLabel(id) ?? (c.pad !== undefined ? PAD_NAME[c.pad] : c.via ? ctl(c.via, as) : ctl(id, "keys"));
  if (c.keys?.length) return keyName(c.keys[0]);
  return c.mouse !== undefined ? keyName(`Mouse${c.mouse}`) : c.name;
}

/** How long a press must be held to count as a hold (ms): long enough that a quick tap never does,
 *  short enough that a hold doesn't feel slow. */
export const HOLD_MS = 300;

/** A line with controls named in braces, {use} or {jump}, each named for the input in use. */
export function ctlText(text: string): string {
  if (!text.includes("{")) return text;
  return text.replace(/\{([a-z0-9.]+)\}/g, (m, id: string) => (byId.has(id) ? ctl(id) : m)).replace(/\b(Hold|hold) (<b>)?hold /g, "$1 $2");
}

/** One place's controls as a strip: "W/S turn · A/D next wheel · E try it", named for the input in use. */
export function strip(place: string, only?: string[]): string {
  const as = input();
  // only what the input in use has: a pad has no WASD, a touch screen no key to find yourself
  const has = (c: Control) => c.say?.[as] !== undefined ? !!c.say[as] : as === "keys" ? !!(c.keys || c.mouse !== undefined) : as === "pad" ? c.pad !== undefined || !!c.via : !!(c.touch || c.via);
  return (PLACES[place] ?? []).filter((c) => (!only || only.includes(c.id)) && has(c)).map((c) => `<b>${ctl(c.id, as)}</b> ${c.name}`).join(" · ");
}

/** Some controls by id as a strip, each with what it does here ("radio up"). */
export function stripOf(rows: [string, string][]): string {
  // a blank "what" runs on into the next: ["left", ""], ["right", "indicate"] reads "← → indicate"
  let out = "";
  rows.forEach(([id, what], i) => {
    const k = ctl(id);
    // a touch word that already says it ("Get out") isn't followed by it again
    const kl = k.toLowerCase(), wl = what.toLowerCase();
    out += kl === wl || kl.endsWith(` ${wl}`) ? `<b>${k}</b>` : what ? `<b>${k}</b> ${what}` : `<b>${k}</b> `;
    if (what && i < rows.length - 1) out += " · ";
  });
  return out;
}

/** Whether a key does a control. */
export const isKey = (code: string, id: string) => !!byId.get(id)?.keys?.includes(code);

// the place you're in now (a minigame or the Driving Test's back seat), if it's taken over some buttons
let here = "";
export function controlsHere(place: string, on: boolean) { if (on) here = place; else if (here === place) here = ""; }
export const placeNow = () => here;
