// Map markers: any player can tag one spot, by tapping the full map or by pressing G while looking
// at it, and everyone in the game sees it. Each marker is a pin in its owner's colour on the
// minimap and the full map, a ring of light on the ground at the spot in the streets, and a pip
// on the compass strip across the top of the screen saying which way it is and how far.
// A marker put down on something on the big map (a job, a challenge, a minigame, a pub, a bus
// stop, a race's checkpoint) goes exactly on it and carries its name and what kind of thing it is,
// so everyone's told what it's on, and in the street its ring hugs that thing instead of the spot
// round it, so you can see what was picked when you get there. None of those things move.
// Each player has a colour of their own on the maps (playerColours).
//
// Who decides what: each player owns their own marker (one each; a new one moves it). They send it
// to everyone when they set or clear it, and again to anyone who joins, so a newcomer sees the
// markers already up. A marker goes when its owner leaves. Older pages don't know the message
// and simply don't show it; what it's on comes as a fourth item and its kind as a fifth, which
// older pages ignore.
import * as THREE from "three";
import { fontEpoch, pinIcon } from "./minimap";
import { sizeOf } from "./show";

/** One player's marker, in scene coordinates. what: the name of the thing it was put down on, if
 *  any, and kind what sort of thing that is (ITEM_SIZE). */
export interface Marker { x: number; y: number; z: number; colour: string; name: string; mine: boolean; job?: boolean; what?: string; kind?: string }

/** How far each kind of thing a marker can be put on reaches from its middle, in metres: the ring
 *  in the street goes just outside it. */
export const ITEM_SIZE: Record<string, number> = {
  job: 1.2, challenge: 1.6, trap: 1.2, game: 2.5, structure: 4, pub: 3, mark: 3, stop: 1, cable: 4, gate: 3,
};

/** The players' colours on the maps, for their arrows and their markers: none of them a colour the
 *  maps already use for something else (the Flag Lads' purple and red, the jobs' badges, the
 *  challenges' yellow, the field's blue edge, the minigames' cyan, the greens of buses and squares
 *  won back), so a player's marker can't be mistaken for anything but theirs. */
export const PLAYER_COLOURS = ["#ff4fa3", "#7d8bff", "#b8f03a", "#19d3a2", "#f4f4f4", "#ff9ec9"];

let coloursKey = "", colours = new Map<string, string>();
/** Each player's colour on the maps. Each takes the colour its id hashes to, unless someone in the
 *  game already has it, when it takes the next free one (in id order, so every page agrees). */
export function playerColours(ids: string[]): Map<string, string> {
  const key = ids.slice().sort().join(",");
  if (key === coloursKey) return colours;
  const taken = new Set<number>(), out = new Map<string, string>(), N = PLAYER_COLOURS.length;
  for (const id of key.split(",")) {
    let h = 0;
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    let k = h % N;
    for (let i = 0; i < N && taken.has(k); i++) k = (k + 1) % N;
    taken.add(k);
    out.set(id, PLAYER_COLOURS[k]);
  }
  coloursKey = key; colours = out;
  return out;
}

const RING = 6;        // metres across the ring of light on the ground
const WALL = 1.4;      // metres tall, the wall of light round it
const FOV = Math.PI;   // the compass strip spans this much of the horizon, centred on where you face

/** A soft white ring, drawn once and tinted per marker. */
let ringTex: THREE.CanvasTexture | undefined;
function ringTexture() {
  if (ringTex) return ringTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(64, 64, 18, 64, 64, 64);
  r.addColorStop(0, "rgba(255,255,255,0)"); r.addColorStop(0.55, "rgba(255,255,255,0.25)");
  r.addColorStop(0.72, "rgba(255,255,255,1)"); r.addColorStop(0.82, "rgba(255,255,255,0.45)"); r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  return (ringTex = new THREE.CanvasTexture(c));
}

/** Light fading upward, for the low wall of light round the ring that shows over long grass. */
let wallTex: THREE.CanvasTexture | undefined;
function wallTexture() {
  if (wallTex) return wallTex;
  const c = document.createElement("canvas");
  c.width = 4; c.height = 64;
  const g = c.getContext("2d")!;
  const r = g.createLinearGradient(0, 64, 0, 0);
  r.addColorStop(0, "rgba(255,255,255,0.9)"); r.addColorStop(0.35, "rgba(255,255,255,0.35)"); r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, 4, 64);
  return (wallTex = new THREE.CanvasTexture(c));
}

/** A marker as it goes over the network ("mk"): where, then what it's on and its kind if it's on something. */
export function markerMessage(m: { x: number; y: number; z: number; what?: string; kind?: string }): (number | string)[] {
  const at: (number | string)[] = [m.x, m.y, m.z];
  if (m.what) at.push(m.what);
  if (m.what && m.kind) at.push(m.kind);
  return at;
}

export class Markers {
  private all = new Map<string, { x: number; y: number; z: number; colour: string; what?: string; kind?: string; view: THREE.Group; mat: THREE.MeshBasicMaterial[] }>();

  constructor(private scene: THREE.Scene) {}

  get size() { return this.all.size; }
  has(id: string) { return this.all.has(id); }
  at(id: string) { return this.all.get(id); }

  /** Put id's marker at scene (x, y, z), in their colour (moving it if they had one): a ring of
   *  light on the ground there, with a low wall of light round it that shows over long grass. On a
   *  thing (kind), the ring is sized to fit round it. Buildings hide it like anything else in the
   *  street; the compass strip says where it is. */
  set(id: string, x: number, y: number, z: number, colour: string, what?: string, kind?: string) {
    this.clear(id);
    const glow = (map: THREE.Texture, side: THREE.Side = THREE.FrontSide) => new THREE.MeshBasicMaterial({
      map, color: colour, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, side,
      depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2,
    });
    const mat = [glow(ringTexture()), glow(wallTexture(), THREE.DoubleSide)];
    const item = kind ? ITEM_SIZE[kind] : undefined;
    // the wall stands at 0.36 of the plane's width, just inside the ring's bright band
    const across = item !== undefined ? (item + 0.4) / 0.36 : RING;
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(across, across), mat[0]);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(across * 0.36, across * 0.36, WALL, 24, 1, true), mat[1]);
    wall.position.y = WALL / 2;
    const view = new THREE.Group();
    view.add(ring, wall);
    view.position.set(x, y, z);
    this.scene.add(view);
    this.all.set(id, { x, y, z, colour, what, kind: item !== undefined ? kind : undefined, view, mat });
  }

  clear(id: string) {
    const m = this.all.get(id);
    if (!m) return;
    this.scene.remove(m.view);
    m.view.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    m.mat.forEach((x) => x.dispose());
    this.all.delete(id);
  }

  /** The markers to draw, with their owners' names and colours. */
  list(self: string, who: (id: string) => { name: string; colour: string }): Marker[] {
    return [...this.all].map(([id, m]) => {
      const w = who(id);
      // the ring in the street takes the owner's colour too, if it's changed since it went down
      if (m.colour !== w.colour) { m.colour = w.colour; for (const x of m.mat) x.color.set(w.colour); }
      return { x: m.x, y: m.y, z: m.z, mine: id === self, what: m.what, kind: m.kind, ...w };
    });
  }

  /** The rings pulse gently, and grow and brighten the further off you are (from 30 m out, up to
   *  four times the size by about 250 m), so a marker down the street still catches the eye.
   *  (x, z) is where you are in the scene. */
  update(t: number, x: number, z: number) {
    const pulse = Math.sin(t * 3.1);
    for (const m of this.all.values()) {
      const far = Math.min(1, Math.max(0, (Math.hypot(m.x - x, m.z - z) - 30) / 220));
      const k = (1 + 3 * far) * (1 + 0.08 * pulse);
      m.mat[0].opacity = m.mat[1].opacity = Math.min(1, (0.65 + 0.25 * pulse) * (1 + 0.6 * far));
      m.view.scale.set(k, 1 + 1.5 * far, k);
    }
  }
}

/** How far, in words: "45 m", "1.2 km". */
function far(d: number) {
  return d < 1000 ? `${Math.round(d / 5) * 5} m` : `${(d / 1000).toFixed(d < 10000 ? 1 : 0)} km`;
}

// what each compass was last drawn showing, so a frame that would draw the same leaves it be
const drawn = new WeakMap<HTMLCanvasElement, string>();

const LETTERS: [number, string][] = [[0, "N"], [45, "NE"], [90, "E"], [135, "SE"], [180, "S"], [225, "SW"], [270, "W"], [315, "NW"]];

/**
 * The compass strip along the top of the screen: the way you face in the middle, half the horizon
 * either side, and a pin for each marker at its bearing with how far away it is. A marker behind
 * you sits at the end of the strip nearest to it, with an arrow saying turn that way. Drawn again
 * only when something on it would change.
 * (x, z) is where you are in the scene and yaw the way you face.
 */
export function drawCompass(c: HTMLCanvasElement, x: number, z: number, yaw: number, markers: Marker[]) {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const css = sizeOf(c), W = Math.round(css.w * dpr), H = Math.round(css.h * dpr);
  if (!W || !H) return;
  const key = `${W} ${H} ${yaw} ${fontEpoch()}` + (markers.length ? ` ${x} ${z} ${JSON.stringify(markers)}` : "");
  if (c.width === W && c.height === H && drawn.get(c) === key) return;
  drawn.set(c, key);
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, W, H);
  const heading = -yaw;                       // clockwise from north, in radians
  const mid = W / 2, pxPerRad = W / FOV;
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  const band = 22 * dpr;                      // the strip itself; the pins' distances hang below it

  // the strip: dark, fading out at both ends
  const bg = g.createLinearGradient(0, 0, W, 0);
  bg.addColorStop(0, "rgba(14,16,18,0)"); bg.addColorStop(0.12, "rgba(14,16,18,0.72)");
  bg.addColorStop(0.88, "rgba(14,16,18,0.72)"); bg.addColorStop(1, "rgba(14,16,18,0)");
  g.fillStyle = bg; g.fillRect(0, 0, W, band);

  // ticks every 15 degrees, with the points of the compass. The big letters and the small ones
  // go in separate rounds because setting the canvas's font is slow, and none of them overlap.
  g.textAlign = "center"; g.textBaseline = "middle";
  for (const size of [15, 12]) {
    g.font = `700 ${size * dpr}px "Barlow Condensed", system-ui, sans-serif`;
    for (let deg = 0; deg < 360; deg += 15) {
      const off = wrap((deg * Math.PI) / 180 - heading);
      if (Math.abs(off) > FOV / 2) continue;
      const px = mid + off * pxPerRad, fade = 1 - Math.abs(off) / (FOV / 2);
      const letter = LETTERS.find(([d]) => d === deg)?.[1];
      if (letter) {
        if ((letter.length === 1 ? 15 : 12) !== size) continue;
        g.globalAlpha = 0.25 + 0.75 * fade;
        g.fillStyle = letter === "N" ? "#ff7a5c" : "#f4f1ea";
        g.fillText(letter, px, band / 2 + 1 * dpr);
      } else if (size === 15) {
        g.globalAlpha = 0.2 + 0.5 * fade;
        g.fillStyle = "#f4f1ea";
        g.fillRect(px - 0.5 * dpr, band * 0.32, 1 * dpr, band * 0.36);
      }
    }
  }
  g.globalAlpha = 1;
  // where you're facing
  g.fillStyle = "#ffdd00";
  g.beginPath(); g.moveTo(mid - 5 * dpr, 0); g.lineTo(mid + 5 * dpr, 0); g.lineTo(mid, 6 * dpr); g.closePath(); g.fill();

  // the markers, furthest first so the nearest sit on top
  const seen = markers.map((m) => {
    const dx = m.x - x, dz = m.z - z;
    return { m, d: Math.hypot(dx, dz), off: wrap(Math.atan2(dx, -dz) - heading) };
  }).sort((a, b) => b.d - a.d);
  g.font = `700 ${11 * dpr}px "Barlow Condensed", system-ui, sans-serif`;
  g.lineJoin = "round";
  const edge = FOV / 2 - 0.12;
  // the distance under each pin (and what it's on, if it's on something), kept on the strip at its
  // ends. On a touch screen the strip is short, so the nearest marker's label goes first and one that
  // would run into it says only how far, or nothing: its pin still shows the way.
  const touch = document.getElementById("touch")?.hidden === false, later: (() => void)[] = [], placed: [number, number][] = [];
  const label = (m: Marker, d: number, px: number) => {
    let text = m.kind && m.what ? `${m.what} · ${far(d)}` : far(d), half = 0, lx = 0;
    const fits = () => {
      half = g.measureText(text).width / 2 + 2 * dpr; lx = Math.min(W - half, Math.max(half, px));
      return !touch || placed.every(([a, b]) => lx + half + 4 * dpr < a || lx - half - 4 * dpr > b);
    };
    if (!fits() && (text = far(d), !fits())) return;
    placed.push([lx - half, lx + half]);
    g.strokeStyle = "rgba(14,16,18,0.9)"; g.lineWidth = 3 * dpr;
    g.strokeText(text, lx, band + 7 * dpr);
    g.fillStyle = m.colour;
    g.fillText(text, lx, band + 7 * dpr);
  };
  for (const { m, d, off } of seen) {
    const behind = Math.abs(off) > edge, side = Math.sign(off) || 1;
    const px = mid + (behind ? side * edge : off) * pxPerRad;
    pinIcon(g, px, band - 3 * dpr, 1.05 * dpr, m.colour, m.mine);
    if (behind) {
      // an arrow beside it: turn this way
      const ax = px - side * 11 * dpr, ay = band / 2;
      g.fillStyle = m.colour;
      g.beginPath(); g.moveTo(ax + side * 4 * dpr, ay); g.lineTo(ax - side * 2 * dpr, ay - 5 * dpr); g.lineTo(ax - side * 2 * dpr, ay + 5 * dpr); g.closePath(); g.fill();
    }
    if (touch) later.unshift(() => label(m, d, px)); else label(m, d, px);
  }
  for (const f of later) f();
}
