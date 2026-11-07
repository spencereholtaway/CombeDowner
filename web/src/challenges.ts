// Team challenges: the big things to do on a map. Each zone of the map (zones.ts) has one or two,
// open once the zone is. A challenge finds its own place from the map's data (a canal lock, a big
// field, a church tower), with the force field shrunk to its zone, so it works on any map, and is
// left out of a map that hasn't got one. Once open it has no noticeboard: the thing itself stands
// waiting at the very spot it'll happen that day (the broken-down bus, the balloons on the grass),
// with its badge on the maps, and you walk up to it to start it. That runs it as a job (quests.ts),
// so it goes round the room, joins and restores the way jobs do, and starts the way every
// minigame does (lineup.ts: the entries, then everyone who entered put at its spots, a title card
// and a countdown); at GO the job's own things take over in the same place. A challenge won leaves one of the strange objects where it finished.
// The games list (gameslist.ts) can start any one placed on the map, open or not.
// docs/challenges.md is the guide to writing one.
//
// Who decides what: nobody. Where each challenge goes comes from the map alone, and which are open
// from how many sockets are full (so which zones are open), which the host of oddments.ts decides
// and sends round; so every player in a room has the same things waiting in the same places.
// Running one is a job's business (quests.ts). With the challenges switched off (features.ts, the
// host's say) none is open, so nothing of them shows anywhere.
import type { GameMap } from "./map";
import { feature } from "./features";
import { dayNumber } from "./daylight";
import type { Zones } from "./zones";
import { hash, registerJob, type Job, type Offer, type QuestWorld, type Waiting } from "./quests";
import type { LineupConfig, LineupSpot } from "./lineup";

/** A place a challenge uses, scene coordinates: its first is where it starts and where the fly-over looks. */
export interface ChallengeSpot { x: number; z: number; name: string; y?: number; a?: number }

/** What a challenge is lent when it starts. */
export interface ChallengeStart {
  offer: Offer; spots: ChallengeSpot[]; w: QuestWorld;
  /** GO (ms since 1970) and who took it: the same on every screen. */
  started: number; by: string;
  /** Who entered (lineup.ts), in order: everyone else just watches. */
  cast: string[];
}

export interface Challenge {
  id: string;
  /** What the title card and the poster call it ("The Tightrope"). */
  name: string;
  /** One line for the poster and the start card. */
  blurb: string;
  /** Its badge on the maps: a letter and a colour. */
  glyph: string; colour: string;
  /** Lower opens first. Challenges on the same tier open in the order of their ids. */
  tier: number;
  /** How hard, 1 to 3, for the poster. */
  stars?: number;
  /** Where it goes on this map, worked out from the map's own data, the same on every machine; null to leave it out of this map. */
  place(map: GameMap): ChallengeSpot[] | null;
  /** The challenge itself, run as a job on every player's screen. Set done.x, done.z to where it finished. */
  start(s: ChallengeStart): Job;
  /** What the start card says to do. */
  goal?(o: Offer): string;
  /** Where the day's run of it happens, when that changes from day to day (the seed is the day's);
   *  left out, it's always the first of its spots. */
  where?(seed: number, spots: ChallengeSpot[], map: GameMap): ChallengeSpot;
  /** What stands there waiting to be taken, built from the poster (offer.seed is the day's) and the
   *  map alone, and where start's own things will be; left out, just a ring of light. */
  waiting?(s: ChallengeWait): Waiting | null;
  /** How it starts (lineup.ts): where those who enter are put, and so on. Left out, round its place. */
  lineup?: Omit<LineupConfig, "spots"> & { spots?(s: ChallengeWait, n: number): LineupSpot[] };
}

/** What a challenge is lent to build what waits at its place. */
export type ChallengeWait = Pick<ChallengeStart, "offer" | "spots" | "w">;

const list: Challenge[] = [];
/** A challenge joins the game. */
export function registerChallenge(c: Challenge) {
  const k = list.findIndex((o) => o.id === c.id);
  if (k >= 0) list[k] = c; else list.push(c);
}

let placedOn: GameMap | null = null;
let placed: { c: Challenge; spots: ChallengeSpot[]; at: number; zone: number }[] = [];
let filled = () => 0;
let zonesOn: Zones | null = null;

/** The challenges on this map, in the order they open, with the zone each is in and how many full
 *  sockets open it. Each zone takes one or two, placed with the force field shrunk to that zone
 *  (zones.ts), lower tiers in the nearer zones. */
export function challengesOn(map: GameMap) {
  if (placedOn !== map) {
    placedOn = map;
    placed = [];
    const zs = zonesOn;
    const left = [...list].sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id));
    const tried = new Map<string, ChallengeSpot[] | null>();
    const place = (c: Challenge, k: number) => {
      const key = `${c.id}:${k}`;
      if (!tried.has(key)) {
        let spots: ChallengeSpot[] | null = null;
        try { spots = c.place(zs ? zs.limited(k) : map); } catch (e) { console.warn(`challenge ${c.id}: can't place it`, e); }
        tried.set(key, spots?.length ? spots : null);
      }
      return tried.get(key)!;
    };
    const zones = zs?.count ?? 1, had = new Array(zones).fill(0);
    for (let pass = 0; pass < 2 && left.length; pass++) {
      for (let k = 0; k < zones && left.length; k++) {
        if (had[k] > pass) continue;
        const i = left.findIndex((c) => place(c, k));
        if (i < 0) continue;
        const c = left.splice(i, 1)[0];
        placed.push({ c, spots: place(c, k)!, zone: k, at: zs ? zs.need(k) : 0 });
        had[k]++;
      }
    }
    placed.sort((a, b) => a.zone - b.zone || a.c.tier - b.c.tier || a.c.id.localeCompare(b.c.id));
  }
  return placed;
}

/** The challenges open with n sockets full. */
export const openWith = (map: GameMap, n: number) => challengesOn(map).filter((p) => n >= p.at);

/** Every challenge there is, placed on this map or not. */
export const allChallenges = (): readonly Challenge[] => list;

const takers = new Map<string, (seed: number) => Offer | null>();
/** A challenge's poster for any seed, wherever its zone is and whatever's been done today (the games
 *  list, gameslist.ts); null if it isn't on this map. */
export const challengeOffer = (id: string, seed: number) => takers.get(id)?.(seed) ?? null;

/** Is challenge id kind of job (quests.ts)? */
export const isChallenge = (kind: string) => list.some((c) => c.id === kind);

/** Hook every challenge on this map into the noticeboards (call once a game, after its map is in). */
export function useChallenges(map: GameMap, zones: Zones, sockets: () => number) {
  filled = sockets;
  zonesOn = zones;
  placedOn = null;
  takers.clear();
  const here = challengesOn(map);
  for (const c of list) {
    const p = here.find((q) => q.c.id === c.id);
    const open = () => feature("challenges") && !!p && placedOn === map && filled() >= p.at;
    const offer = (seed: number, x: number, z: number, where: string): Offer => ({
      kind: c.id, seed, stars: c.stars ?? 3, title: c.name, blurb: c.blurb,
      reward: feature("strange") ? "Something strange, left where you finish" : "Bragging rights", x, z, where,
    });
    const posterFor = (seed: number) => {
      if (!p) return null;
      const at = c.where?.(seed, p.spots, map) ?? p.spots[0];
      return offer(seed, at.x, at.z, at.name);
    };
    takers.set(c.id, posterFor);
    registerJob({
      id: c.id, glyph: c.glyph, colour: c.colour, label: "Challenge",
      challenge: true, open, goal: c.goal,
      offer: () => null,
      // one board a day, where it's happening, so you take it on the spot
      daily: () => {
        const o = open() ? posterFor(hash("challenge", c.id, dayNumber())) : null;
        return o && [o];
      },
      start: (o, w, started, by, _local, cast) => c.start({ offer: o, spots: p?.spots ?? [{ x: o.x, z: o.z, name: o.where }], w, started, by, cast }),
      lineup: c.lineup && { ...c.lineup, spots: c.lineup.spots && p ? (o, w, n) => c.lineup!.spots!({ offer: o, spots: p.spots, w }, n) : undefined },
      waiting: c.waiting && p ? (o, w) => c.waiting!({ offer: o, spots: p.spots, w }) : undefined,
    });
  }
}
