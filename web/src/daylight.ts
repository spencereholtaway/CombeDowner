// Day and night: a whole day goes by every 24 minutes, sunrise to sunset, dusk, a moonlit night and
// dawn again, with the sun crossing the sky from east to west and the street lamps and windows
// coming on after dark.
//
// Nothing goes over the network: the time of day comes from the clock (the time since 1970, which
// every computer and phone already agrees on to within a second or two), so everyone in a room,
// and everyone anywhere, sees the same sky at the same moment, host or not.
//
// For testing: ?time=21:30 in the address stops the clock at that time, ?daylen=4 makes a day last
// four minutes, and the debug panel (F3) has a button that moves your own clock on three hours.
import * as THREE from "three";

const q = new URLSearchParams(location.search);
/** Real seconds in a game day. */
const DAY = Math.max(10, Number(q.get("daylen") || 24) * 60);
/** ?time=HH:MM stops the clock there (a fraction of the day), or null. */
const FIXED = (() => {
  const m = /^(\d{1,2})(?::(\d{2}))?$/.exec(q.get("time") ?? "");
  return m ? ((Number(m[1]) % 24) + Number(m[2] ?? 0) / 60) / 24 : null;
})();
/** Hours added to this player's clock from the debug panel. */
let skip = 0;
/** So that a new day dawns at round real-time moments rather than at midnight UTC: about 10 am at
 *  the top of each 24 minutes. */
const PHASE = 10 / 24;

/** The time of day, as a fraction: 0 midnight, 0.25 six in the morning, 0.5 noon. */
export function timeOfDay(): number {
  const t = FIXED ?? (Date.now() / 1000 / DAY + PHASE);
  return (((t + skip / 24) % 1) + 1) % 1;
}

/** The time of day as "21:30". */
export function clockText(): string {
  const m = Math.floor(timeOfDay() * 24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Whether the clock is the shared one, stopped by ?time, or moved on by the debug panel. */
export function clockKind(): string {
  return FIXED !== null ? "stopped by ?time" : skip ? `your own, ${skip} h ahead of everyone's` : "shared";
}

/** Move this player's clock on (for testing: other players keep the shared time). */
export function skipHours(h: number) { skip = (skip + h) % 24; }

/** The light at one moment: where the sun is, and the colours of everything it lights. */
export interface Sky {
  /** Towards the sun (scene axes), below the horizon at night. */
  sun: THREE.Vector3;
  /** Towards whatever casts the shadows: the sun by day, the moon by night. */
  light: THREE.Vector3;
  lightCol: THREE.Color; lightI: number;
  hemiSky: THREE.Color; hemiGround: THREE.Color; hemiI: number;
  fog: THREE.Color; top: THREE.Color;
  /** 0 by day .. 1 in the dark: lamps, windows and stars. */
  night: number;
}

// the look at a few heights of the sun, in between them blended
const KEYS: [number, { top: string; fog: string; light: string; lightI: number; hemiSky: string; hemiGround: string; hemiI: number }][] = [
  [-0.3, { top: "#0a1226", fog: "#1a2236", light: "#9db4e0", lightI: 0.55, hemiSky: "#5a6c96", hemiGround: "#22242c", hemiI: 0.75 }],
  [-0.1, { top: "#1d2a4e", fog: "#4a4a62", light: "#9db4e0", lightI: 0.35, hemiSky: "#7a86aa", hemiGround: "#33313a", hemiI: 0.8 }],
  [0.0, { top: "#44629a", fog: "#d49a7a", light: "#ff9850", lightI: 0.5, hemiSky: "#c0a6a6", hemiGround: "#4e4638", hemiI: 0.95 }],
  [0.12, { top: "#5f8cc4", fog: "#e2c3a4", light: "#ffc890", lightI: 1.9, hemiSky: "#d8d4d0", hemiGround: "#615b44", hemiI: 1.2 }],
  [0.35, { top: "#6f9fd0", fog: "#c9d6df", light: "#fff0d8", lightI: 2.6, hemiSky: "#cfe0f0", hemiGround: "#6b6a4a", hemiI: 1.4 }],
];
const KC = KEYS.map(([h, k]) => [h, {
  top: new THREE.Color(k.top), fog: new THREE.Color(k.fog), light: new THREE.Color(k.light), lightI: k.lightI,
  hemiSky: new THREE.Color(k.hemiSky), hemiGround: new THREE.Color(k.hemiGround), hemiI: k.hemiI,
}] as const);

const out: Sky = {
  sun: new THREE.Vector3(), light: new THREE.Vector3(), lightCol: new THREE.Color(), lightI: 0,
  hemiSky: new THREE.Color(), hemiGround: new THREE.Color(), hemiI: 0, fog: new THREE.Color(), top: new THREE.Color(), night: 0,
};

/** The sky now (the same object each time, refilled). */
export function sky(): Sky {
  // the sun's hour angle: 0 at noon, due south; it rises in the east (+x) and sets in the west
  const h = (timeOfDay() - 0.5) * Math.PI * 2;
  // a long summer-ish day: it's up from about half five till half six
  const up = 0.82 * Math.cos(h) + 0.2;
  out.sun.set(-Math.sin(h) * 0.9, up, 0.35 + 0.45 * Math.cos(h)).normalize();
  // by night the moon, opposite the sun and high in the south
  if (out.sun.y >= 0) out.light.copy(out.sun);
  else out.light.set(-out.sun.x * 0.6, Math.max(0.35, -out.sun.y), 0.5).normalize();
  const e = out.sun.y;
  let i = 0;
  while (i < KC.length - 2 && e > KC[i + 1][0]) i++;
  const [h0, a] = KC[i], [h1, b] = KC[i + 1];
  const f = THREE.MathUtils.clamp((e - h0) / (h1 - h0), 0, 1);
  out.top.lerpColors(a.top, b.top, f);
  out.fog.lerpColors(a.fog, b.fog, f);
  out.lightCol.lerpColors(a.light, b.light, f);
  out.lightI = a.lightI + (b.lightI - a.lightI) * f;
  // the light swaps from sun to moon just under the horizon: dim it there so it doesn't jump
  out.lightI *= THREE.MathUtils.smoothstep(Math.abs(e), 0.0, 0.06) * 0.85 + 0.15;
  out.hemiSky.lerpColors(a.hemiSky, b.hemiSky, f);
  out.hemiGround.lerpColors(a.hemiGround, b.hemiGround, f);
  out.hemiI = a.hemiI + (b.hemiI - a.hemiI) * f;
  out.night = 1 - THREE.MathUtils.smoothstep(e, -0.12, 0.06);
  return out;
}

/** How dark it is now, 0 by day to 1 at night (for the cats, who get braver after dark). */
export function nightNow(): number {
  return sky().night;
}
