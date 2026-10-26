// Three parts of the game that are played on Dan's copy of the site and held back on Spencer's for
// now: the zones (the map opening a part at a time, zones.ts), the strange objects and their
// structures (oddments.ts, reveal.ts) and the team challenges (challenges.ts and each challenge's
// file). The code is the same on both sites; these switches say which of the three are on.
//
// Which copy of the game this is goes by the page's address, the same way the play counts tell
// them apart (telemetry.ts): on for danturn.github.io and for a copy run on this computer, off
// anywhere else, Spencer's site included. ?progression=1|0 switches all three on or off for one
// visit: they hang together, as the challenges bring the objects and the objects open the zones.
//
// Who decides what: the host. Each page reads its own switches once, at the start; the host sends
// its own with its state ("st", game.ts), and everyone else in the room plays by those, so a player
// from either site sees the same game. With a host on a page from before the switches, everyone
// keeps their own.

export type Feature = "zones" | "strange" | "challenges";
export type Features = Record<Feature, boolean>;

/** This copy of the game: the page's address without the page or the query. */
export const site = location.host + location.pathname.replace(/[^/]*$/, "");

function local(): boolean {
  if (import.meta.env.DEV) return true;
  const h = location.hostname;
  return h === "localhost" || h === "[::1]" || h.endsWith(".local") || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h);
}

function read(): Features {
  const on = location.hostname === "danturn.github.io" || local();
  const v = new URLSearchParams(location.search).get("progression");
  const all = v === "1" ? true : v === "0" ? false : on;
  return { zones: all, strange: all, challenges: all };
}

/** This page's own switches. */
export const mine: Readonly<Features> = read();
let room: Features = { ...mine };

/** Whether a feature is on in this game (the host's say once it's been heard). */
export const feature = (k: Feature) => room[k];

/** The switches packed for the host's state message: never 0, so it's always sent. */
export const packFeatures = (f: Features) => 8 | (f.zones ? 1 : 0) | (f.strange ? 2 : 0) | (f.challenges ? 4 : 0);
export function unpackFeatures(n: unknown): Features | null {
  const v = Number(n);
  if (!Number.isInteger(v) || !(v & 8)) return null;
  return { zones: (v & 1) !== 0 && (v & 2) !== 0, strange: (v & 2) !== 0, challenges: (v & 4) !== 0 };
}

/** Take on a room's switches. Returns which changed. */
export function setFeatures(f: Features): Feature[] {
  const changed = (Object.keys(room) as Feature[]).filter((k) => room[k] !== f[k]);
  if (changed.length) room = { ...f };
  return changed;
}
