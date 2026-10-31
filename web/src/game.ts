// The match: local player, remote players, shooting, damage, deaths, respawns and scores.
//
// Who decides what:
// - Each player moves themselves and sends their position about 20 times a second.
// - The shooter checks their own hits against what they see (it feels fair to the shooter, and
//   cheating isn't a worry among friends), then tells the host.
// - The host applies damage, kills and scores, and tells everyone. The host is simply the player
//   with the lowest id, so if the host leaves, the next player takes over with the latest scores.
// - The host also runs the naughty boys (see naughtyboys.ts), and decides when their punches land.
// - And the cats (cats.ts): shots at them go to the host, which sends the swarm after the shooter.
// - And Bendy (bendy.ts), the boss up by Fonthill Road: shots at him go to the host, which decides
//   when his lashes land, and he goes for whoever shot him.
// - Passive mode (settings.ts) is for the whole game, and the host chooses: whoever starts the game brings
//   their own setting, the host sends it round at the end of their position updates, and everyone takes
//   it from there. A new host carries on with it, until they change their own setting. When it's on, the
//   host keeps the cats, naughty boys and Bendy off everyone and never lets them land a blow, and seagull
//   muck lands on nobody.
// - The host also owns the pickups (see pickups.ts) and decides who gets each one, and the ladders
//   (ladders.ts): who's carrying one, and where each stands against a wall.
// - All of that (and the traffic and the buses) goes on wherever the players are, in Combe Down or
//   out in Bath: the host loads the streets round everyone (tiles.ts) to run it there, and a call
//   for a bus at a stop out in Bath says where the stop is.
// - Everyone says which map they're on in their hello. Players on another map in the same room
//   (two people who started the same code at once) can't see each other, but they're still in the
//   same match: the scoreboard is one for the whole room, and its host is the match host (see
//   below), so travelling to Bradford-on-Avon keeps your score and everyone else on it.
// - Travelling by train to another town (main.ts's travel, railway.ts's doors and boarding) is the
//   one way the map changes mid-game: the same Game is rebuilt on the new map with the same
//   connection, voice links and match state, starting on the arrival station's platform. The game's clock carries over and the ride takes its real-line time on it (the host tells everyone). Each map
//   has its own host for the world it runs (traffic, naughty boys, cats, pickups); kills, scores
//   and respawns go to the one match host for the room, over everyone, travellers included. The
//   radio (hold V) carries across maps (voice.heard), but the nearby voice does not: there's no
//   position to place it. All of it is ignored by an older page, which just sees you on your map.
// - Voice chat (voice.ts) goes straight between players; who's talking rides in position updates.
// - Kicks at goal and bowling at the stumps (sport.ts): the kicker sends the kick so everyone sees it
//   fly, and says if it went in; the host puts a prize under the posts or behind the stumps.
// - Vehicles (vehicles.ts): the host says who gets in (the first to ask gets the wheel, then the
//   seats fill up) and sends round who's in what and where everything's parked. The driver moves their vehicle and sends where it is, and
//   claims anyone they run over, like a shot.
// - Going to a pub from the big map (pubmap.ts, goTo) just moves you there: like any move, it goes out in
//   your next position update, and everyone else sees you vanish and turn up outside the pub. You come
//   back to life outside the last pub you went to, which is your own business too. Whether something's
//   after you and holds you back (travelHold) is judged from what every player already has: the naughty
//   boys', cats' and Bendy's targets as the host sends them, and the shots you've seen.
// - The canal (canal.ts): the host runs its locks and boats and sends them round; working a lock, taking a
//   tiller and the throttle you set go to the host. The trains (railway.ts) run to the clock, so nobody
//   sends them; anyone a train hits says so to the host, which takes it as a kill by "train".
// - The cable car (cableway.ts) runs to the clock as well, so nobody sends it either.
// - Hot air balloons (balloons.ts): whoever's flying one sends where it is ("bl"); anyone else in the
//   basket rides along and says where they stand in it. The host sends where the ones nobody's in
//   have come down; the lawn they wait on and the other flights run to the clock.
// - Standing on a boat or a train's roof, or riding a cable car cabin, you're carried along with it, on
//   your own screen like any move.
// - Driving a bus on the 2 or the 4 (busdriver.ts): the route, its stops and its passengers are the
//   driver's own, made up on their machine; nothing about them is sent.
// - Map markers (markers.ts): each player sets their own and sends it to everyone, and to anyone who joins.
// - Rides (rides.ts): you ride yourself, like walking, and say what you're on in your position updates. A hard
//   crash into a wall you tell the host about, as with a train, and it takes it as damage. Tricks and their
//   score (ridetricks.ts) are yours alone.
// - Jobs (quests.ts): today's noticeboards come from the clock; whoever takes a job sends it round, and the
//   host tells anyone joining what job is on. The host runs whatever a job needs (a Wanted man's crew).
//   Someone over a race's line or out of it, waiting for the others (race.ts), says so in their position
//   updates ("rw"), and the host lets nothing hurt them; killed out of it, they come back once it's over.
// - The Flag Lads (invasion.ts): where it starts each day comes from the clock; the host runs the
//   spreading, the call-outs and its crews, and sends how it stands ("bv"). Whoever shoots a flag down says so,
//   and everyone says when they're busy on a job, so the host can hold the Flag Lads off while all are.
// - The night out (nightout.ts): the host decides what follows a job well done (a poster or a phone call) and last
//   orders, and sends it ("no"); every screen builds the same follow-up job from its link.
// - Scars (scars.ts): a job lost or a pub kept leaves a mark for the day; the host keeps the list and sends
//   it ("scr"), and whoever clears one says so.
// - The strange objects and their structure (oddments.ts): the host keeps where each lies, who carries
//   which and how many sockets are full, and sends it ("od"); picking one up, setting it down and
//   filling a socket are asks ("odq"). A milestone's fly-over (reveal.ts) plays on every screen.
// - The zones (zones.ts): how many are open follows from the sockets full, so the wall stands in the
//   same place on every screen with nothing more sent; the host's word on the sockets also says
//   whether the room is in free play.
// - Which of the zones, the strange objects and the team challenges are on (features.ts) is the
//   host's say, sent with its state ("st"); everyone else plays by the host's switches.
import * as THREE from "three";
import * as SFX from "./audio";
import { padInUse, padText, rumble } from "./gamepad";
import { B as PAD, control, ctl, ctlText, input, isKey, placeNow, strip, stripOf } from "./controls";
import { urlSpot } from "./debug";
import { MineTour } from "./minetour";
import { DeliDoor } from "./delidoor";
import { Breakdown } from "./breakdown";
import { Jamie, REST as JAMIE_REST, SMOKE } from "./jamie";
import { DayBendy } from "./daybendy";
import { RecordPlayer } from "./recordplayer";
import { GolfDriver } from "./golfdriver";
import { Bonfire } from "./bonfire";
import { Oddments } from "./oddments";
import { bonfireKey } from "./saves";
import { Reveal } from "./reveal";
import { challengesOn, useChallenges } from "./challenges";
import { Zones, type TravelFind } from "./zones";
import { mine as myFeatures, packFeatures, setFeatures, unpackFeatures, type Features } from "./features";
import "./challengetest";
import "./lockrun";
import "./bells";
import "./theclimb";
import "./pushbus";
import "./tightrope";
import "./drivingtest";
import "./gallery";
import { Flash } from "./flash";
import { Avatar, colourFor } from "./avatar";
import { Blood, OnBody, onBody, Walker } from "./blood";
import { Skids } from "./skids";
import { Headlights, Lit } from "./headlights";
import { Torches } from "./torch";
import { clockAt, clockLink, getSkip, nightNow, setSkip, skipHours, timeOfDay } from "./daylight";
import { gore, listenForCheat, paintFor, watch } from "./gore";
import { Broadcast } from "./broadcast";
import { show, say, setHidden, setStyle } from "./show";
import { limitShown } from "./limits";
import { Ladders } from "./ladders";
import { carryIcon } from "./carryicons";
import { CHAIR, CRICKET, GIRL, LADDER, NAUGHTY, NaughtyBoyState, NaughtyBoys, RUGBY, SOCIETY, Target } from "./naughtyboys";
import { Invasion } from "./invasion";
import { NightOut } from "./nightout";
import { missionActive, missionCardUp } from "./missionscreens";
import { Daily, note as noteDaily } from "./daily";
import * as Trophies from "./trophies";
import { CatState, Cats, ESCAPE } from "./cats";
import { BENDY_HP, Bendy, BendyState } from "./bendy";
import { clearSpot } from "./haunts";
import * as Posh from "./posh";
import { GameMap, Mover, PATHS, Place, RayHit } from "./map";
import { DEFAULT_MAP, mapName } from "./maps";
import { Net, type MessageType } from "./net";
import { Minimap, type Blip, type Mate } from "./minimap";
import { PubMap, type TravelHold } from "./pubmap";
import { Watch } from "./watch";
import { MapKey } from "./mapkey";
import { drawCompass, ITEM_SIZE, markerMessage, Markers, playerColours } from "./markers";
import { BLIP, AMMO_PICKUP, BOOST_SECONDS, Kind, PINT_HEAL, Pickups, SNIPER_PICKUP, isRide, type Item } from "./pickups";
import { Player, EYE, CROUCH_EYE, PRONE_EYE, settleRate, stickSteer } from "./player";
import { Quests, type Perch, type QuestWorld } from "./quests";
import { decodeLevel, voiceLevel } from "./voicelevel";
import { Scars, scarKindOf } from "./scars";
import "./wanted";
import { myRosettes } from "./trail";
import "./race";
import "./gulls";
import "./stunts";
import "./climb";
import { abbeyLadders } from "./abbeyclimb";
import { Wings } from "./wings";
import type { Route } from "./railway";
import { Balloons } from "./balloons";
import { IN_TROLLEY, RIDES, RideView, TROLLEY_AHEAD, rideCode, rideOf, rideSpecs, type RideKind } from "./rides";
import { RideTricks } from "./ridetricks";
import * as Quips from "./quips";
import * as Telemetry from "./telemetry";
import { Sports } from "./sport";
import { isStartup, Loose, Shove, Stop, Vehicle, Vehicles, VKind } from "./vehicles";
import { CAR_MASS, KNOCK, Obstacle, Traffic, TRAFFIC_ID } from "./traffic";
import { BusDriver, busRouteSpots } from "./busdriver";
import { view } from "./view";
import { freeRoam, passive as myPassive } from "./settings";
import { Voice } from "./voice";
import { ammoLabel, damage, Effects, type Follow, follow, GunKind, GUNS, MAX_RESERVE, SLOTS, SNIPER_MAX_RESERVE, Weapon } from "./weapon";
import { World } from "./world";
import { pop } from "./pop";
import { count as wardCount, earn, myWear, onEarn } from "./wardrobe";
import { Ambience } from "./ambience";
import { Announcer } from "./announce";
import * as Yours from "./yours";
import * as Paper from "./paper";

const TOWN: Record<string, string> = { "combe-down": "Bath" };

const LOW_BRIDGE = 1.15;    // a bridge's arch is this far under its deck's top, over the middle of the canal (world.ts)
const BUILT_IN_PUBS = import.meta.glob<{ pb?: [number, number, string, number | null, number | null][] }>("../public/maps/*-pubs.json", { eager: true, import: "default" });

const RESPAWN_SECONDS = 3;
const YOUR_ARROW = "#ffdd00";    // you, in yellow, like your arrow on the map
const MARK_RANGE = 1500;        // metres: how far away G can put a marker
const MARK_SNAP = 12;           // metres: a marker put down this close to a job, a challenge or a minigame is put on it
// what keeps you from going to a pub: you can't use one to get out of trouble
const HOSTILE_NEAR = 40;        // metres: anything after you this close
const HURT_HOLD = 5000;         // ms since anything last hurt you
const PVP_HOLD = 10000;         // ms since you and another player last shot at each other
const SHOT_NEAR = 2;            // metres: a shot passing this close to someone was a shot at them
const TAKEOVER_NEAR = 150;      // metres from a pub takeover that's on: you're in it
/** What the naughty boys' kinds are called when they're after you: one, and several. */
const AFTER_YOU: Record<number, [string, string]> = {
  [NAUGHTY]: ["a naughty boy", "naughty boys"], [RUGBY]: ["a rugby player", "rugby players"],
  [CRICKET]: ["a cricketer", "cricketers"], [SOCIETY]: ["a Flag Lad", "Flag Lads"], [CHAIR]: ["a Flag Lads boss", "Flag Lads bosses"],
  [GIRL]: ["a naughty girl", "naughty girls"],
};
const NUMBERS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/** How close (x, y, z) comes to the line from a to b. */
function nearLine(a: THREE.Vector3, b: THREE.Vector3, x: number, y: number, z: number): number {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, len = dx * dx + dy * dy + dz * dz;
  const t = len ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy + (z - a.z) * dz) / len)) : 0;
  return Math.hypot(a.x + dx * t - x, a.y + dy * t - y, a.z + dz * t - z);
}
const SEND_HZ = 20;
const NAUGHTY_HZ = 10;
/** Who hit you, when it was a naughty boy, the rugby team or the cricket team: by kind (see naughtyboys.ts). */
const GANG = ["naughtyBoy", "rugby", "cricket", "society", "ladder", "chair", "naughtyGirl"];
/** What to call them, and how they finish you off. */
const GANG_NAME: Record<string, string> = { naughtyBoy: "A naughty boy", rugby: "A rugby lad", cricket: "A cricketer", cat: "A cat", traffic: "A local driver", bendy: "Bendy", train: "A train", crash: "A wall", society: "A Flag Lad", ladder: "A ladder lad", chair: "The Gaffer", naughtyGirl: "A naughty girl" };
const GANG_HOW: Record<string, string> = { naughtyBoy: "battered", rugby: "flattened", cricket: "batted", cat: "mauled", traffic: "ran over", bendy: "snapped", train: "ran down", crash: "stopped", society: "flagged", ladder: "laddered", chair: "cable-tied", naughtyGirl: "handbagged" };
/** Who you decked, by kind. */
const DECKED = ["a naughty boy", "a rugby lad", "a cricketer", "a Flag Lad", "a ladder lad", "the Gaffer", "a naughty girl"];
/** How a shot naughty boy (or rugby lad, or cricketer) goes in the kill feed: one at random each time. */
const NAUGHTY_DOWN = ["decked", "floored", "sorted out", "flattened", "sent home", "dropped", "laid out"];
/** And a shot cat: "X <this>". {c} is "a cat". */
const CAT_DOWN = ["did for {c}", "used up the last life of {c}", "sent {c} to the big cattery in the sky", "knocked {c} off its wall",
  "stopped {c} purring", "put {c} out for the night", "turned {c} into a draught excluder", "cancelled {c}", "gave {c} the snip, permanently"];
const CAT_PAINT = ["splatted {c}", "painted {c} a new colour", "gave {c} a new coat", "turned {c} into modern art", "tagged {c}"];
const anyOf = (list: string[]) => list[Math.floor(Math.random() * list.length)];
/** The warning when a gang of each kind is after you. */
const CHASED = ["Naughty boys are after you. Leg it!", "The rugby team are after you. Leg it!", "The cricket team are after you. Leg it!",
  "The Flag Lads are after you. Leg it!", "", "The Gaffer is after you. Leg it!", "Naughty girls are after you. Leg it!"];
const isGang = (id: string) => id in GANG_NAME;
/** The ones of those that are accidents, not attacks: passive mode doesn't stop them. */
const ACCIDENTS = new Set(["traffic", "train", "crash"]);
/** The colour of someone's paintballs, from a player's own colour. Nobody else fires paint. */
const paintOf = (id: string) => (isGang(id) ? null : paintFor(colourFor(id)));
const KICK_WAIT = 0.15;                  // seconds after your last shot before your aim settles from the kick
const PAINT_SPEED = 120, PAINT_SPEED_SNIPER = 220;   // how fast a paintball flies, m/s
const SPOT_KEY = "cd-spots";             // last place you stood in each room, so rejoining puts you back
const BOAT_CHASE_KEY = "cd-boat-chase";  // whether you steer a narrowboat from the back deck or with the chase camera (C)
const INSIDE_KEY = "cd-inside";         // whether you drive from the driver's seat or with the chase camera (C)
const SPOT_TTL = 24 * 3600 * 1000;       // forget a spot after a day
const PK_EVERY = 2;                      // seconds between the host's pickup lists
const TIP_MS = 4000;                      // how long the middle of the screen says what to do with what you've got, before it's only by its icon
const LEFT_LIFE = 120;                    // seconds a ride or a ladder you left for another lies there
const IDLE_LINE = 25;                    // seconds stood still before you say something about it
const CONV_GAP = 15000;                  // ms: the host takes one score (posts or stumps) per player this often
/** What landed under the posts, as the kicker hears it. */
const PRIZE: Partial<Record<Kind, string>> = {
  boost: "a bottle of Lucozade", fizz: "a bottle of Bucks Fizz", sniper: "a sniper rifle", sammo: "a box of sniper rounds", ammo: "a tin of rifle rounds", pint: "a pint",
};
const BINO_FOV = 8;                      // binoculars: a bit closer than the sniper's scope (11)
const BINO_ZOOM = 0.89;                  // and slow the mouse a bit more to match
const RUN = 3;                           // the "weapon" when someone's run over (after fists, rifle and sniper)
const BLAST = 4;                         // and when a car in the traffic goes up by them
const BLAST_R = 9;                       // how far a car going up hurts the naughty boys round it, m
const BLAST_HIT = 170;                   // and how much, right next to it
const CAR_REACH = 1.8;                   // how close to a vehicle you get in
const VH_EVERY = 2;                      // seconds between the host's vehicle lists
const BUS_EVERY = 60;                    // seconds between the host sending a bus nobody's using back to a stop
const DELIVERY_CHANCE = 0.4;             // how often a gang of naughty boys arrives in a Nova
const STOP_REACH = 3.5;                  // how close to a bus stop's flag you can call a bus
const CALL_GAP = 10000;                  // ms: the host sends each player one bus this often
/** What a call for a bus can ask for: 1 for a minibus, 2 for a double-decker. */
const BUS_KEYS: Record<string, Vehicle["kind"]> = { Digit1: "minibus", Digit2: "bus" };
/** What a vehicle does to someone it hits at speed (m/s, times how heavy it is). */
const runDamage = (s: number) => Math.round(Math.min(150, Math.max(10, ((Number(s) || 0) - 3) * 7)));
/** What you hear as you get in. */
const CAR_LINE: Record<string, string> = {
  bus: "Badgerline, route 2 to Combe Down. Fares please",
  minibus: "Badgerline minibus, hail and ride. Mind the step",
  nova: "Vauxhall Nova: the estate's finest",
  metro: "Austin Metro: a British car to beat the world",
  sierra: "Ford Sierra: the jelly mould",
  police: "Police Sierra. {horn} for the siren",
  transit: "Ford Transit: room for your mates in the back",
  icecream: "Mr Whippy. {horn} for Greensleeves",
  chipvan: "Mr D's chip van: mind the fryers on the corners",
  milkfloat: "Milk float: fifteen miles an hour, flat out",
  c5: "Sinclair C5. Keep your head down",
  roller: "The heavy roller: slow, and it doesn't stop for anyone",
  xr3i: "Ford Escort XR3i: nought to sixty in under ten seconds",
  robin: "Reliant Robin: three wheels, so mind the corners",
  landrover: "Land Rover: fields, tracks and hills are all the same to it",
  golf: "Volkswagen Golf GTI: the original hot hatch",
  golfdriver: "Volkswagen Golf Driver: someone's left the tape running",
  paramount: "Arleen Coaches, Plaxton Paramount: day trips and tours",
  alizee: "Arleen Coaches, Van Hool Alizée: sit back and enjoy the view",
};

/** A vehicle the host is driving: naughty boys on their way somewhere, or a bus someone's called (by them, to pull in at). */
interface Delivery {
  route: { x: number; z: number }[]; k: number; size: number; t: number; stuck: number;
  by?: string; at?: { x: number; z: number; a: number };
  settle?: number;   // a bus that's pulled up: how long it's been easing in to the kerb
}
interface Score { name: string; k: number; d: number; c: number; hp: number; alive: boolean; life: number }

/** What travels with you to another town (main.ts's travel): the room's connection and the match's
 *  state stay put, so stepping off the train doesn't start a new game. */
export interface GameCarry {
  born: number;                              // when you started this game, for working out the host
  since: [string, number][];                 // when everyone else did
  scores: Record<string, Score>;             // the one scoreboard
  hp: number; life: number; alive: boolean;  // how the fight was going
  at: { x: number; z: number; yaw: number }; // where you step off (the arrival platform)
  cameFrom: string;                          // the map you left, for the toast
  voice: Voice;                              // the same voice links, so nobody's dropped on the way
  arriveAt?: string;                         // the station to stand on when we get there
  skip: number;                              // how far the game's clock has been moved on, so the new Game keeps the time
  journeySecs: number;                       // how long the ride takes on the real line, in game seconds
}
interface Remote {
  id: string; name: string; colour: string; avatar: Avatar; life: number; lastSeen: number; lastShot: number;
  px: number; pz: number; stride: number;   // where they were last frame, and how far since their last footstep
  level: number;                                                 // how loud they say they are on their mic (voicelevel.ts)
  rideCode: number; grindStyle: number; rideView?: RideView;    // what they're riding (rides.ts), and it drawn under them
  cab?: number;                             // the cable car cabin they're in (1 or 2), if any
  bal?: number;                             // the balloon basket they're in (balloons.ts, its number), if any
  deadLife?: number;                        // the life we've been told they lost, so a late position update can't stand them back up
  torch?: boolean;                          // their torch is on
  inCar?: boolean;                          // in a vehicle, by their own word (undefined: their page doesn't say)
  smoking?: boolean;                        // smoking one of Jamie's cigarettes, by their own word: nothing hurts them
  waiting?: boolean;                        // out of a race and waiting for it to end, by their own word: nothing hurts them
  carOff?: number;                          // seconds they've said they're out while our list has them in a seat (a stale seat)
}

/** The end of a player's state message ("st"): after the twelve numbers everyone has always sent, the
 *  rest by name, so more can be added without upsetting pages that don't know it yet. Anything off is
 *  left out. */
interface StateExtra {
  cab?: number[];      // in a cable car cabin: which one (1 or 2), and where in it (x, y, z), so we draw them in our cabin there
  bal?: number[];      // in a balloon's basket: which one, and where in it (x, y, z), the same way
  passive?: boolean;   // the game's in passive mode (only the host's say counts)
  host?: boolean;      // they say they're host
  wings?: boolean;     // the angel's wings on (wings.ts)
  glow?: boolean;      // flying with them, glowing gold
  car?: boolean;       // in a vehicle, by their own word: only then is their body hidden in a seat
  gr?: number;         // grinding, in a style (1 + which of the ride's five, rides.ts): their ride sits on the edge that way
  smoke?: boolean;     // smoking one of Jamie's cigarettes (jamie.ts): the host lets nothing hurt them
  rw?: boolean;        // over a race's line or out of it, waiting for the others (race.ts): the host lets nothing hurt them
  wv?: number;         // waving from a narrowboat's tiller: 1 the left hand, 2 the right, 3 both
  vl?: number;         // how loud they are on their mic (voicelevel.ts): 0 quiet, 1 talking, 2 shouting, plus 4 laughing
  ft?: number;         // the host's switches for the zones, the strange objects and the challenges (features.ts)
}
const stripped = (e: Record<string, unknown>) => Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined && v !== false && v !== 0)) as StateExtra;

/** The named end of a state message, or what older pages packed into numbers there instead: 13 numbers
 *  (or 17, after a cabin spot) end in bits for passive (1), host (2), wings (4) and glowing (8); 16
 *  numbers end with the cabin spot alone; anything shorter says none of it. Those pages never say
 *  whether they're in a vehicle, so car stays undefined, nor (before passive mode) whether they're host,
 *  so host does too. null: a page from before any of it. */
function stateExtra(d: unknown[]): StateExtra | null {
  const last = d[d.length - 1];
  if (d.length === 13 && last && typeof last === "object") {
    const e = last as Record<string, unknown>, cab = Array.isArray(e.cab) && e.cab.length === 4 ? e.cab.map(Number) : undefined;
    const bal = Array.isArray(e.bal) && e.bal.length === 4 ? e.bal.map(Number) : undefined;
    return { cab: cab?.every(Number.isFinite) ? cab : undefined, bal: bal?.every(Number.isFinite) ? bal : undefined, passive: e.passive === true, host: e.host === true,
      wings: e.wings === true, glow: e.glow === true, car: e.car === true, smoke: e.smoke === true, rw: e.rw === true, gr: Number(e.gr) || 0, wv: (Number(e.wv) || 0) & 3, vl: (Number(e.vl) || 0) & 7, ft: Number(e.ft) || 0 };
  }
  const cab = d.length >= 16 ? d.slice(12, 16).map(Number) : undefined;
  if (d.length !== 13 && d.length !== 17) return cab ? { cab } : null;
  const pv = Number(last) || 0;
  return { cab, passive: (pv & 1) !== 0, host: (pv & 2) !== 0, wings: (pv & 4) !== 0, glow: (pv & 8) !== 0 };
}

/** A number for someone's voice, from their id, so they always sound the same. */
const voiceOf = (id: string) => ([...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7) & 0xffff) || 1;
const STRIDE = 1.6;   // metres between footsteps

const $ = (id: string) => document.getElementById(id)!;

/** A pub to go to: where to stand (scene coords) and which way to face, or, with no yaw, the pub
 *  itself, and the street outside is found on the way. rating: its food hygiene rating, 0 to 5. */
interface Pub { name: string; x: number; z: number; yaw?: number; rating: number | null }

export class Game {
  readonly player: Player;
  readonly weapon = new Weapon();
  readonly effects: Effects;
  private skids: Skids;                             // skid marks and tyre smoke
  readonly naughtyBoys: NaughtyBoys;
  readonly bendy: Bendy;
  readonly cats: Cats;
  readonly pickups: Pickups;
  readonly ladders: Ladders;
  readonly wings: Wings;
  readonly balloons: Balloons;
  private balloonA = 0;                            // which way your basket faced last frame, so your view turns with it
  private perchBare = false;                       // a job has your hands busy, or shows you the view from somewhere else: no gun in front of you
  private ldT = 0;                                 // host: seconds to the next ladder list
  private ldHost = "";                             // who was host last frame, for handing the ladders over
  private ladderAsked = 0;                         // when we last asked the host to put one up or take one down
  readonly sports: Sports;
  readonly broadcast = new Broadcast();             // the TV cameras on your kicks and balls
  readonly voice: Voice;
  readonly vehicles: Vehicles;
  readonly traffic: Traffic;                     // cars driving themselves round the streets
  private busDriver: BusDriver;                  // the 2 and the 4, when you're driving a bus (busdriver.ts)
  private stopsT = 0;                            // seconds till the bus stops on the maps are looked up again
  private headlights: Headlights;                // their lights after dark, and every driven vehicle's
  private torches: Torches;                      // everyone's torch, on F
  torchOn = false;
  private lit: Lit[] = [];
  private tfT = 0;
  private cnT = 0;                               // host: seconds till the next canal update
  private helmT = 0;                             // at a tiller: seconds till we next send our throttle
  private throttle = 0;                          // at a tiller: the throttle, -1 astern .. 1 flat out
  private tiller = 0;                            // and the tiller, -1..1 (+ over to the right, bow to the left)
  private helmWas: number | null = null;         // the boat whose tiller we had last frame
  /** What you're standing on that moves (a boat, a train's roof), and where it was a frame ago. */
  private carrier: { m: Mover; x: number; z: number; a: number; top: number } | null = null;
  private solid: Mover[] = [];                   // boats and carriages put in the map's movers this frame
  private flowing = new Map<number, number[]>(); // locks filling or emptying this frame: where, and how loud
  private rushes = new Map<number, NonNullable<ReturnType<typeof SFX.rush>>>();
  private trainEngines = new Map<string, SFX.Engine>();
  private nicking = false;                       // the car we've asked for is one we're pulling out of the traffic
  /** The vehicle you're in, and which seat (0 is the driver's). */
  private ride: { v: Vehicle; seat: number } | null = null;
  private windowsDown = false;                     // a job's car with its windows wound down (drivingtest.ts): the street comes in
  private sentLevel = 0;                           // how loud we last said we were (voicelevel.ts)
  /** The vehicle you're driving. */
  private get car(): Vehicle | null { return this.ride?.seat === 0 ? this.ride.v : null; }
  /** At the wheel of something (a game controller's triggers are then its pedals). */
  get driving() { return !!this.car; }
  /** At a car's wheel or a narrowboat's helm: the pad's driving buttons (the horn rings the bell). */
  get atWheel() { return !!this.car || !!this.world.canal?.helmOf(this.net.selfId); }
  private hornWas = false;                       // the horn key last frame, to switch a siren on and off
  private blinkWas = false;                      // the indicators were lit last frame, for the relay's tick
  private inside = (() => { try { return localStorage.getItem(INSIDE_KEY) === "1"; } catch { return false; } })();   // driving from the driver's own seat (C), not the chase camera
  private insideOf: Vehicle | null = null;       // the vehicle whose inside is drawn round you
  private boatChase = (() => { try { return localStorage.getItem(BOAT_CHASE_KEY) === "1"; } catch { return false; } })();   // at a tiller: the chase camera, not the back deck
  private boatYaw: number | null = null;         // at a tiller: which way the boat was heading last frame, so your view turns with it
  private wave = 0;                              // at a tiller: waving, 1 the left hand, 2 the right, 3 both (← and →)
  private waveHeld = 0;                          // the same from the ◀ ▶ buttons on a touch screen
  private bellWas = false;                       // at a tiller: the bell key last frame, so holding it rings once
  private steerer: Avatar | null = null;         // you, stood at the tiller, for the chase camera to see
  private insideYaw: number | null = null;       // which way it was heading last frame, so your view turns with it
  private milkT = 0;                             // when the milk last went (ms)
  private busT = BUS_EVERY;                      // host: seconds till a spare bus goes back to a stop
  private nextNaughtyBoy = 1;
  /** Host: Novas full of naughty boys on their way somewhere, along a route. */
  private deliveries = new Map<Vehicle, Delivery>();
  private busMenu = 0;                           // the bus menu's open at a stop till then (ms): 1 or 2 to call one
  get busMenuUp() { return this.busMenu > performance.now(); }
  /** There's something to use, get in or take right here (the touch screen's Use button is up). */
  get useOffered() { return !$("t-car").hidden; }
  private busStop: Stop | null = null;           // which stop
  private myBus = -1;                            // the bus on its way to us, for the map
  private callAt = new Map<string, number>();    // host: when each player last called a bus (ms)
  private roadEnds: Map<string, { r: number[][]; at: number }[]> | null = null;   // where pieces of street join, for routes
  private stopOk = new WeakMap<Stop, boolean>();  // which bus stops have room for a bus to pull in
  private askedCar = -1;                         // the vehicle we've asked the host to get in
  private askedAt = 0;
  private mineTour: MineTour;
  private deliDoor: DeliDoor;
  private breakdown: Breakdown;                // the BMW broken down outside No. 23 Chinese Kitchen
  private jamie: Jamie;                        // Jamie Mair, smoking up on Lansdown, with a cigarette for you
  private dayBendy: DayBendy;                  // Bendy by day: a history teacher at Grenville's monument
  private records: RecordPlayer;               // the record player on Solsbury Hill
  private golfDriver: GolfDriver;              // the Golf Driver on Royal Avenue, and its tape
  private bonfire: Bonfire;
  private oddments: Oddments;                  // the strange objects and the structure that wants them
  private zones: Zones;                        // the map opened up a zone at a time
  private zonesSeen = -1;                      // the zones' version last drawn on the maps and the travel
  private wallSaid = 0;                        // when the wall last had its say
  private routeShut = -1;                      // the bus you were told has no route yet
  private reveal: Reveal;                      // the fly-over when a challenge opens up                    // Get Wood: Kingswood's bonfire on the court by Fonthill Road
  private flash: Flash;                        // the light of a firework bursting or a car going up
  private useKey = false;                        // E pressed: get in or out
  /** The touch Jump button, held while driving: the handbrake. */
  handbrake = false;
  private vhT = 0;                               // host: seconds till the next vehicle list
  private vhKnown: boolean;                      // we know where the vehicles are: we started the game, or someone's told us
  private vsT = 0;                               // seconds till we next say where our vehicle is
  private engines = new Map<object, SFX.Engine>();
  private ambience: Ambience | null = null;   // the background: traffic, birds, wind
  private runT = new Map<string, number>();      // when we last ran each person over (ms), so one hit counts once
  private blood: Blood;
  private remotes = new Map<string, Remote>();
  // players in this room on a different map: their name, which map, and when we last heard from them
  // (for the debug panel, so they show as away rather than as a link that never said hello)
  private elsewhere = new Map<string, { name: string; map: string; seen: number }>();
  private pendingArrival?: string;                   // the station we're stepping off at, set while boarding
  /** Travelling to another town (main.ts sets this): the train calls it, handing over what must
   *  come with us. main.ts rebuilds the Game on the new map with it. */
  onTravel: ((toMap: string, carry: GameCarry) => void) | null = null;
  private since = new Map<string, number>();       // when each player started this game (from their hello), for working out who's host
  private born = Date.now();                        // when we did
  private known: Set<string>;                       // players who've said hello: not someone still on the menu, looking for a game
  private scores: Record<string, Score> = {};      // the host's word, copied to everyone
  private hp = 100;
  private alive = true;
  /** Drops this game's window and document listeners when it goes (dispose). Normally a game only
   *  ends by leaving the page, but travelling by train (main.ts) disposes one and starts another on
   *  the page, so the old game's listeners must come off or every key would be handled twice. */
  private readonly listeners = new AbortController();
  private life = 0;                                 // goes up on each respawn, so stale hits are ignored
  private deadFor = 0;
  private killer = "";
  private sendT = 0;
  private sbT = 0;
  private chT = 0;
  private ktT = 0;
  private clkT = 0;
  private furyT = 0;      // a while between "the cats are coming" warnings
  /** Where the cats came for you from, while they're after you: how far you've still to run is counted from here. t: till the next count. */
  private catsFrom: { x: number; z: number; t: number } | null = null;
  private chasedT = 0;
  private sinceShot = 0;   // seconds since your last shot, for your aim to settle after the kick     // a while between "naughty boys are after you" warnings
  private pkT = 0;
  private claimed = new Map<number, number>();   // pickups asked for, and when (ms), so we don't keep asking
  private hintT = 0;                             // a while between "can't pick that up" hints
  private boostT = 0;                            // seconds of double damage left (Lucozade)
  private smokeT = 0;                            // seconds left of one of Jamie's cigarettes: nothing hurts you, and double damage
  private jamieRest = 0;                         // and till he'll give you another
  private rideMulT = 0; private rideMulV = 1;      // a race's lift to your ride's speed, and for how much longer
  private slowT = 0;                             // seconds of wading through seagull muck left (gulls.ts)
  private swarmLife = -1;                        // which life a cat swarm came for you in, to see if you lived through it
  private tummyT = 0;                            // tummy time not yet added to your wardrobe's count
  private unEarn = () => {};
  private cardShown: unknown = null;
  diveReq = 0;                                   // a touch dive button (-1 left, 1 right)
  private kickKey = false;                       // Space pressed: kick, if you're lined up
  private leaveKey = false;                      // E pressed: walk off the ball
  private anyKey = false;                        // a key pressed: back from the TV cameras to your own eyes
  private convAt = new Map<string, number>();    // host: when each player last scored at the posts or stumps (ms)
  firing = false;
  aiming = false;
  private wasAiming = false;
  private wasReloading = false;
  binoculars = false;   // B: held up to your eyes
  private bino = 0;     // how far up they are, 0..1
  shootOnce = false;   // a tap in touch mode
  /** True when the mouse isn't captured: touch controls handle looking and firing. */
  freeMode = false;
  private spawns: [number, number][] = [];
  private lastLook = { dx: 0, dy: 0 };
  private idleT = 0;   // seconds stood still doing nothing, for a line about it
  private hitT = 0;
  private hurtT = 0;
  private homePub: Pub | null = null;             // the last pub you went to: you come back to life outside it
  private landing: { pub?: Pub; t: number } | null = null;   // just gone to a pub (or started out in Bath): seconds left to check where you landed
  private upFrom: "mine" | "deli" | null = null;   // back up from the mines or the deli, before the square with its door has loaded
  private hurtAt = -1e9;                           // when someone last hurt you (ms), so you can't escape a fight by pub
  private pubList: Pub[] = [];
  private toastT = 0;
  /** Passive mode for this game (settings.ts): starts as your own setting, then the host's say. */
  private passive = myPassive;
  private myPassiveWas = myPassive;
  private placeT = 0;
  private spotT = 0;                               // when the spot was last saved (ms)
  private streets: { x: number; z: number; n: string }[] = [];
  private sentTalk = 0;                            // the talk state in our last position update
  active = false;   // pointer locked and playing
  private minimap: Minimap;
  private pubMap: PubMap;
  private mapBackTo: (() => void) | null = null;   // opened from the pause menu: closing it goes back there
  private pvp = new Map<string, number>();         // players you've traded shots with, and when (ms), so a pub's no escape
  private yourT = 0;                             // seconds till what's yours and the paper next hear where you are
  private minePoint: { x: number; z: number } | null = null;   // the square pointed at on the big map, for what you've done there
  /** The watch on your wrist, bottom left: the time of day. */
  private watch = new Watch(document.getElementById("watchlcd") as HTMLCanvasElement);
  /** The big map's key, which switches layers off the maps. */
  private mapKey: MapKey;
  private markers: Markers;                       // everyone's map markers
  private marks = new Map<string, { label: string; colour: string }>();   // the jobs' own markers ("@..."), by id
  readonly quests: Quests;                         // today's jobs, and the one we're on
  readonly invasion: Invasion;                     // the Flag Lads' hold on Bath
  readonly night: NightOut;                        // jobs that lead into each other, and last orders
  readonly scars: Scars;                           // what losing has left about the town today
  private trailLines = new Map<string, number[]>();   // the treasure trail's bearing lines, on your own map alone
  private daily!: Daily;                           // today's jobs, shown when you join and under Tab
  private announcer = new Announcer();             // the station announcements (announce.ts)
  private joinNews = false;                         // the once-a-day showing of the Chronicle on joining stays up longer
  private dailyT = -1;                             // when the panel goes after you join (performance.now; -1: not shown yet)
  private rideFrom: { x: number; z: number } | null = null;   // where you were last frame on a ride, for the metres ridden
  private held: RideKind | null = null;            // the ride you've got with you (rides.ts), and whether you're on it
  private swapAt: Item | null = null;              // a ride or a ladder at your feet while your hands are full: E swaps for it
  private riding = false;
  private heldToast: { text: string; secs: number } | null = null;   // a call-out kept back till a race's countdown or a title card is over
  private calmed = false;
  private hushed = false;                          // a race's countdown had the middle of the screen last frame
  private rideTip = 0;                             // till when the middle of the screen says what to do with what you've just got, or just got on
  private tipSlot: string | null = null;           // what was in your hands last frame, to start that tip when it changes
  private basket = "";                             // whose trolley you're riding in, if anyone's
  private myRide: RideView;                        // your ride, drawn under you
  private rideTricks: RideTricks;                  // its combo, score and feel
  private pubsReady = false;                       // the full pub list has arrived (or won't), so today's jobs can be put up
  private reloadSound: SFX.Playing | null = null;
  private step = 0;                                // which footstep you're on, from the walk's bob

  constructor(
    private map: GameMap,
    private world: World,
    private camera: THREE.PerspectiveCamera,
    readonly net: Net,
    readonly name: string,
    readonly room: string,
    known: string[] = [],
    carry?: GameCarry,
  ) {
    this.known = new Set(known);
    if (carry) {
      // travelling to another town: the same game carries on, so what says who's who and how the
      // match is going comes with us (main.ts's travel)
      this.born = carry.born;
      this.since = new Map(carry.since);
      this.scores = carry.scores;
      this.hp = carry.hp;
      this.life = carry.life;
      this.alive = carry.alive;
    }
    this.player = new Player(map, this.listeners.signal);
    this.player.canProne = true;
    this.player.noDive = () => !!this.car || !!this.ride || this.riding || this.oddments.carrying(this.net.selfId) || this.map.inWater(this.player.pos.x, this.player.pos.z);
    this.effects = new Effects(world.scene);
    this.blood = new Blood(world.scene, world.surface);
    this.skids = new Skids(world.scene, (x, z, y) => world.surface(x, z, y));
    watch(world.scene);   // everyone's guns switch between paintball markers and rifles with the setting
    listenForCheat((text) => this.toast(text, 2.5));
    this.naughtyBoys = new NaughtyBoys(map, world.scene);
    // the zones first, so the wall's in place before anything is put anywhere
    this.zones = new Zones(map, this.mapId);
    this.zones.show(world.scene, world.fieldLook);
    this.oddments = new Oddments(map, world.scene, this.mapId, this.room, this.zones, freeRoam);
    this.cats = new Cats(map, world.scene);
    this.bendy = new Bendy(map, world.scene);
    this.pickups = new Pickups(map, world.scene);
    this.ladders = new Ladders(map, world.scene);
    this.wings = new Wings(map, world.scene, this.weapon.scene, (t, s) => this.toast(t, s));
    // the solo on the heavenly guitar: each note to everyone, and theirs played where they are
    this.wings.onNote = (f, d, b) => this.net.send("gtr", [Math.round(f * 10) / 10, Math.round(d * 100) / 100, b]);
    this.ladders.onRaise = (x, y, z) => SFX.ladderUp(...this.hear(x, y, z));
    this.balloons = new Balloons(map, world.scene, this.net.selfId, (d) => this.net.send("bl", d));
    this.sports = new Sports(map, world.scene);
    this.sports.onSay = (text, secs) => this.toast(text, secs);
    this.sports.who = () => ({ id: this.net.selfId, name: this.name });
    this.sports.players = () => [...this.remotes.values()].map((r) => ({ id: r.id, name: r.name, x: r.avatar.x, z: r.avatar.z, alive: r.avatar.alive }));
    this.sports.send = (t, d, to) => this.net.send(t, d, to);
    this.sports.onSound = (what, x, y, z, vol) => {
      const [d, pan] = this.hear(x, y, z);
      if (what === "post") SFX.post(d, pan);
      else if (what === "stumps") SFX.stumps(d, pan);
      else if (what === "bowl") SFX.bowl(d, pan);
      else SFX.kick(d, pan, vol);
    };
    this.sports.onKick = (o, v, sport, wind) => {
      const q = (n: number) => Math.round(n * 100) / 100;
      this.net.send("kick", [q(o.x), q(o.y), q(o.z), q(v.x), q(v.y), q(v.z), sport === "c" ? 1 : sport === "f" ? 2 : 0, q(wind.x), q(wind.z)]);
    };
    this.sports.onScore = (p, e, hard) => {
      const claim = { p, e, h: hard ? 1 : 0 };
      if (this.isHost) this.applyConv(this.net.selfId, claim);
      else this.net.send("conv", claim, this.hostId);
    };
    // travelling keeps the voice links: the same Voice is handed in, so nobody is dropped on the way
    this.voice = carry?.voice ?? new Voice(net, (text, secs) => this.toast(text, secs));
    this.vehicles = world.vehicles;
    // a bus we're in, or pulled open the door of, is not one to take away with its square
    map.onTileGone = (m) => this.vehicles.dropSquare(m, (v) => this.ride?.v === v || this.askedCar === v.i);
    this.traffic = new Traffic(map, world.scene, (x, z, y) => world.surface(x, z, y));
    this.busDriver = new BusDriver(map, world.scene, this.traffic, (x, z) => world.surface(x, z), (text, secs) => this.toast(text, secs));
    this.traffic.onBoom = (x, y, z) => this.carGoesUp(x, y, z);
    this.headlights = new Headlights(world.scene);
    this.torches = new Torches(world.scene);
    this.traffic.onUnpark = (i) => this.vehicles.unpark(i);
    this.traffic.parkedMake = (i) => this.vehicles.parkedMakeOf(i);
    this.traffic.onCrunch = (x, y, z, force) => SFX.crash(force, ...this.hear(x, y, z));
    this.traffic.onSmoke = (x, y, z, thick) => { if (Math.hypot(x - this.camera.position.x, z - this.camera.position.z) < 160) this.effects.smoke(new THREE.Vector3(x, y, z), thick); };
    this.mineTour = new MineTour(map, world.scene);
    this.deliDoor = new DeliDoor(map, world.scene);
    this.breakdown = new Breakdown(map, world.scene);
    this.jamie = new Jamie(map, world.scene);
    this.dayBendy = new DayBendy(map, world.scene);
    this.records = new RecordPlayer(map, world.scene);
    this.records.hear = (x, y, z) => this.hear(x, y, z);
    this.golfDriver = new GolfDriver((text, secs) => this.toast(text, secs));
    this.golfDriver.hear = (x, y, z) => this.hear(x, y, z);
    this.bonfire = new Bonfire(map, world.scene, bonfireKey(this.mapId, this.room));
    this.bonfire.send = (t, d, to) => this.net.send(t, d, to);
    this.bonfire.toast = (text, secs) => this.toast(text, secs);
    this.bonfire.hear = (x, y, z) => this.hear(x, y, z);
    this.flash = new Flash(world.scene);
    this.bonfire.flash = this.flash;
    this.oddments.send = (t, d, to) => this.net.send(t, d, to);
    this.oddments.toast = (text, secs) => this.toast(text, secs);
    this.oddments.hear = (x, y, z) => this.hear(x, y, z);
    this.oddments.onGot = () => this.tookOddment();
    this.oddments.leave = (ride, x, z) => { if (isRide(ride as Kind)) { this.pickups.place(x, z, ride as RideKind, LEFT_LIFE); this.net.send("pk", this.pickups.snapshot()); } };
    this.oddments.onOpen = () => this.quests?.repost();
    this.reveal = new Reveal(map, () => this.freeMode);
    this.vhKnown = !this.peers().length;
    this.naughtyBoys.onSwing = (x, y, z, voice) => {
      const [d, pan] = this.hear(x, y + 1.4, z);
      SFX.punch(d, pan);
      if (Math.random() < 0.5) SFX.effort(d, pan, voice);
    };
    this.naughtyBoys.onShout = (x, y, z, voice, kind, line, scared) => {
      const [d, pan] = this.hear(x, y + 1.6, z);
      // legging it, they all say their piece out loud, high and frightened
      if (scared) Posh.speak(line, voice, d, undefined, kind === GIRL, 1.5);
      else if (kind === NAUGHTY) SFX.shout(d, pan, voice); else Posh.speak(line, voice, d, undefined, kind === GIRL);
    };
    this.cats.onSound = (what, x, y, z, voice) => {
      const [d, pan] = this.hear(x, y + 0.3, z);
      if (what === "meow") SFX.meow(d, pan, voice);
      else if (what === "hiss") SFX.hiss(d, pan, voice);
      else SFX.claw(d, pan, voice);
    };
    this.naughtyBoys.arrive = (x, z, size) => this.deliver(x, z, size);
    this.bendy.onSpot = (x, y, z, id) => {
      SFX.screech(...this.hear(x, y + 3.8, z));
      if (id === this.net.selfId && this.alive) { this.toast("Bendy has seen you", 3); SFX.alarm(); }
    };
    this.bendy.onJump = (x, y, z, out) => SFX.blink(out, ...this.hear(x, y + 1, z));
    this.bendy.onLash = (x, y, z) => SFX.lash(...this.hear(x, y + 2.5, z));
    this.bendy.onStep = (x, y, z) => {
      const [d, pan] = this.hear(x, y, z);
      if (d < 50) SFX.step(this.world.paved(x, z), 0.4, d, pan);
    };
    this.naughtyBoys.onStep = (x, y, z, speed) => {
      const [d, pan] = this.hear(x, y, z);
      if (d < 35) SFX.step(this.world.paved(x, z), speed > 3 ? 0.26 : 0.12, d, pan);
    };
    this.minimap = new Minimap(map, document.getElementById("minimap") as HTMLCanvasElement);
    this.mapKey = new MapKey($("mapkey"), (off) => { this.minimap.off = off; });
    this.pubMap = new PubMap({
      pubs: () => this.pubs(),
      hold: () => this.travelHold(),
      goTo: (i) => {
        const why = this.goTo(i);
        if (!why && this.mapOpen) { this.mapBackTo = null; this.toggleMap(); }
        return why;
      },
      mark: (p) => this.setMarker(p.x, p.z, undefined, p.name, "pub"),
    }, this.minimap);
    this.minimap.spots = this.gameSpots();
    $("minimap").addEventListener("pointerdown", (e) => { e.stopPropagation(); this.toggleMap(); });
    $("bigmap").addEventListener("pointerdown", (e) => { e.stopPropagation(); this.toggleMap(); });
    $("bigmapme").addEventListener("pointerdown", (e) => { e.stopPropagation(); this.minimap.centreFull(this.player.pos.x, this.player.pos.z); });
    // tapping the full map itself puts your marker there (or takes it down, tapping it again)
    this.markers = new Markers(world.scene);
    this.mapGestures($("bigmapcanvas") as HTMLCanvasElement);
    this.buildSpawns();
    this.loadPubs();
    this.myRide = new RideView(world.scene);
    this.rideTricks = new RideTricks((text, secs) => this.toast(text, secs));
    this.player.paved = (x, z) => world.paved(x, z);
    this.player.lift = (x, z) => world.surface(x, z) - map.trueGround(x, z);
    this.quests = new Quests(this.questWorld(), () => this.pubsReady);
    const self = this;
    this.quests.onDone = (won) => { if (won) { Quips.kill(true); noteDaily("job"); } };
    this.scars = new Scars({
      map: this.map, scene: this.world.scene, naughtyBoys: this.naughtyBoys,
      get selfId() { return self.net.selfId; },
      get isHost() { return self.isHost; },
      get slot() { return self.room === "SOLO" ? "solo" : `${self.mapId}:${self.room}`; },
      me: () => ({ x: this.player.pos.x, y: this.player.pos.y, z: this.player.pos.z, alive: this.alive }),
      crew: () => 1 + this.remotes.size,
      targets: () => this.targets(),
      peck: () => { this.player.kick(0.12); this.player.yaw += (Math.random() - 0.5) * 0.3; SFX.hurt(); },
      send: (data, to) => this.net.send("scr", data, to),
      toast: (text, secs) => this.toast(text, secs),
      feed: (html) => this.feed(html),
      nameOf: (id) => this.questWorld().nameOf(id),
      prize: (x, z, good) => { this.pickups.bonus(x, z, good); this.net.send("pk", this.pickups.snapshot()); },
      hear: (x, y, z) => this.hear(x, y, z),
    });
    this.quests.onScar = (o, x, z) => { const k = scarKindOf(o.kind); this.scars.add(k, x, z, k === "tag" ? o.title : o.where || o.title); };
    // something new for your wardrobe: say so, and show everyone
    this.unEarn = onEarn((w) => {
      this.toast(`New in your wardrobe: ${w.name}!`, 3.5);
      this.feed(`You earned <b>${esc(w.name)}</b> for your wardrobe (pause menu)`);
      SFX.jobStep();
      this.hello();
    });
    this.invasion = new Invasion({
      map: this.map, scene: this.world.scene, naughtyBoys: this.naughtyBoys,
      get selfId() { return self.net.selfId; },
      get isHost() { return self.isHost; },
      me: () => ({ x: this.player.pos.x, y: this.player.pos.y, z: this.player.pos.z, alive: this.alive, yaw: this.player.yaw }),
      players: () => this.targets(),
      pubs: () => this.pubList.filter((q) => this.map.fieldEdge(q.x, q.z) > 1),
      get slot() { return self.room === "SOLO" ? "solo" : `${self.mapId}:${self.room}`; },
      nameOf: (id) => this.questWorld().nameOf(id),
      send: (data, to) => this.net.send("bv", data, to),
      toast: (text, secs) => this.toast(text, secs),
      feed: (html) => this.feed(html),
      mark: (id, at, label, colour) => this.questWorld().mark(id, at, label, colour),
      prize: (x, z, good) => { this.pickups.bonus(x, z, good); this.net.send("pk", this.pickups.snapshot()); },
      give: (x, z, kind) => { this.pickups.place(x, z, kind); this.net.send("pk", this.pickups.snapshot()); },
      scar: (x, z, pub, by) => this.scars.add("pub", x, z, `${pub}|${by}`),
      trick: () => this.alive ? (this.player.grind ? "grind" : this.ride ? (this.ride.v.kind === "bus" ? "a bus" : "a moving vehicle") : this.riding && this.held ? rideSpecs[this.held].name : "") : "",
      solo: () => this.remotes.size === 0,
      busy: () => (!!this.quests.running && !this.quests.running.done) || !!missionActive(),
      place: () => $("where").textContent || "Bath",
    });
    this.quests.fugitives = () => this.invasion.fugitives();
    this.night = new NightOut(this.questWorld(), this.quests, this.invasion);
    this.quests.onEnd = (o, d) => { this.night.jobEnd(o, d); this.oddments.jobEnd(o, d, this.isHost); };
    this.invasion.onEvent = (what, d) => { this.night.flagLads(what, d); if (what === "won") this.oddments.pubWon(d, this.isHost); };
    useChallenges(map, this.zones, () => (this.zones.free ? Infinity : this.oddments.filled));
    this.planTravel();
    this.daily = new Daily((text, secs) => this.toast(text, secs), () => this.invasion.status(), () => this.placeName(), () => Paper.newsPage(this.mapId, this.placeName()));
    this.stopTrophies = Trophies.attach(() => this.trophyLook());
    Yours.useMap(this.map, this.mapId);
    Yours.scarsFrom(() => this.scars?.marks() ?? []);
    Paper.begin(this.map, this.mapId, this.placeName(), this.room, (id) => (id === this.net.selfId ? this.name : this.remotes.get(id)?.name ?? this.scores[id]?.name ?? "Someone"), this.name);
    this.joinNews = Paper.firstToday() && Paper.hasNews();
    $("scoreboard").onclick = () => this.putAwayDaily();
    if (!carry) this.scores[net.selfId] = { name, k: 0, d: 0, c: 0, hp: 100, alive: true, life: 0 };
    // back up from the mines: out of the front door of 1 The Firs (or out of the deli after a shift)
    const back = new URLSearchParams(location.search);
    const up = back.get("up") === "1" ? (back.get("from") === "deli" ? this.deliDoor.outside() : this.mineTour.outside()) : undefined;
    // (the door's square not in yet: out of it once it is)
    if (back.get("up") === "1" && !up) this.upFrom = back.get("from") === "deli" ? "deli" : "mine";
    const at = urlSpot();       // ?at= in the address: start at that spot, facing that way (debug.ts)
    // arriving by train: stand on the station platform we've come to, its own middle
    const pl = carry?.arriveAt ? this.world.railway?.platform(carry.arriveAt) : null;
    const arrival = carry ? (pl ? { x: pl.centre[0], z: -pl.centre[1], yaw: Math.PI } : carry.at) : undefined;
    this.respawn(arrival ?? up ?? at ?? this.savedSpot());
    if (at && !up) this.player.pitch = at.pitch;
    addEventListener("pagehide", () => this.saveSpot(), { signal: this.listeners.signal });
    document.addEventListener("visibilitychange", () => { if (document.hidden) this.saveSpot(); }, { signal: this.listeners.signal });

    const here = (fn: (d: any, from: string) => void) => (d: any, from: string) => { if (!this.elsewhere.has(from)) fn(d, from); };
    this.listen("hello", (d, from) => this.onHello(d, from));
    // the debug panel's "+3 hours" (daylight.ts): the host moves the game's clock on and tells
    // everyone; anyone else asks the host
    this.listen("clk", here((d, from) => {
      if (!Array.isArray(d) || typeof d[1] !== "number") return;
      if (d[0] === "add" && this.isHost) { setSkip(getSkip() + d[1]); this.net.send("clk", ["set", getSkip()]); }
      else if (d[0] === "set" && from === this.hostId && !this.isHost) setSkip(d[1]);
    }));
    setSkip(carry?.skip ?? 0);   // a new game starts on the shared time, until its host says otherwise; a journey keeps it
    clockLink.ask = (h) => {
      if (this.isHost) { setSkip(getSkip() + h); this.net.send("clk", ["set", getSkip()]); }
      else this.net.send("clk", ["add", h], this.hostId);
    };
    this.listen("st", (d, from) => this.onState(d, from));
    this.listen("bl", here((d, from) => this.balloons.onState(d, from)));
    this.listen("gtr", here((d, from) => {
      const v = this.posOf(from);
      if (!v || !Array.isArray(d)) return;
      const [f, dur, bend] = d.map(Number);
      if (f > 50 && f < 4000 && dur > 0 && dur < 3 && Math.abs(bend) <= 12) SFX.guitarLead(f, dur, bend, ...this.hear(v.x, v.y + 1.2, v.z));
    }));
    this.listen("shot", here((d, from) => this.onShot(d, from)));
    // kills, respawns and the scoreboard follow you across maps, so they go to and come from the
    // match host (the one host for the whole room), not this map's host. Not wrapped in here():
    // a traveller's hit is still a hit, wherever they've gone.
    this.listen("hit", (d, from) => { if (this.isMatchHost) this.applyHit(from, d); });
    this.listen("ev", here((d) => this.onEvent(d)));
    this.listen("sb", (d, from) => { if (from === this.matchHostId) this.onScores(d); });
    this.listen("rs", (d, from) => { if (this.isMatchHost) this.applyRespawn(from, d.life); });
    this.listen("ch", here((d: NaughtyBoyState, from) => { if (from === this.hostId && !this.isHost) this.naughtyBoys.apply(d); }));
    this.listen("chit", here((d, from) => { if (this.isHost) this.applyNaughtyBoyHit(from, d); }));
    this.listen("kt", here((d: CatState, from) => { if (from === this.hostId && !this.isHost) this.cats.apply(d); }));
    this.listen("khit", here((d, from) => { if (this.isHost) this.applyCatHit(from, d); }));
    this.listen("bd", here((d: BendyState, from) => { if (from === this.hostId && !this.isHost) this.bendy.apply(d); }));
    this.listen("bhit", here((d, from) => { if (this.isHost) this.applyBendyHit(from, d); }));
    this.listen("pick", here((d, from) => { if (this.isHost) this.applyPick(from, d); }));
    this.listen("pk", here((d, from) => { if (from === this.hostId && !this.isHost) this.pickups.apply(d); }));
    this.listen("ldr", here((d, from) => { if (this.isHost) this.applyLadder(from, d); }));
    this.listen("lds", here((d, from) => {
      // a host that's just handed over sends us what it had: keep it all
      if (this.isHost) { if (from !== this.net.selfId) { this.ladders.merge(d); this.sendLadders(); } return; }
      if (from !== this.hostId) return;
      const had = this.ladders.carriers.has(this.net.selfId), asked = performance.now() - this.ladderAsked < 3000;
      this.ladders.apply(d);
      if (asked && !had && this.ladders.carriers.has(this.net.selfId)) { SFX.pickup("ladder"); this.tookLadder(); }   // taken down to carry
    }));
    this.listen("kick", here((d, from) => this.sports.remoteKick(d, from)));
    this.listen("so", here((d, from) => this.sports.remoteState(d, from)));
    this.listen("sd", here((d, from) => this.sports.remoteMsg(d, from)));
    this.listen("conv", here((d, from) => { if (this.isHost) this.applyConv(from, d); }));
    this.listen("call", here((d, from) => { if (this.isHost) this.applyCall(from, d); }));
    this.listen("vin", here((d, from) => { if (this.isHost) this.applyEnter(from, d); }));
    this.listen("vout", here((d, from) => { if (this.isHost) this.applyExit(from, d); }));
    // updates from whoever's driving (or from the host, for a car full of naughty boys)
    this.listen("vs", here((d, from) => {
      const v = this.vehicles.get(d?.[0]);
      if (v && v !== this.car && (v.driver === from || ((!v.driver || v.driver.startsWith("@")) && from === this.hostId))) v.push(d);
    }));
    // a newcomer takes the list from whoever sends it first (they may be the host already, with the lowest id)
    this.listen("tf", here((d, from) => { if (from === this.hostId && !this.isHost) this.traffic.apply(d); }));
    this.listen("tfw", here((d, from) => { if (from === this.hostId && !this.isHost) this.traffic.applyWrecks(d); }));
    this.listen("tfx", here((d, from) => { if (this.isHost && Array.isArray(d)) this.traffic.shove(d[0], d[1], d[2], d[3], from); }));
    this.listen("tfp", here((d, from) => { if (this.isHost && Array.isArray(d)) this.knockParked(d[0], d[1], d[2], d[3], from); }));
    this.listen("vk", here((d, from) => {
      const v = Array.isArray(d) ? this.vehicles.list.find((o) => o.i === d[0]) : undefined;
      if (this.isHost && v) this.knockVehicle(v, d[1], d[2], d[3], from);
    }));
    this.listen("vh", here((d, from) => { if (!this.vhKnown || (from === this.hostId && !this.isHost)) this.onVehicles(d); }));
    this.listen("cn", here((d, from) => { if (from === this.hostId && !this.isHost) this.world.canal?.apply(d); }));
    this.listen("cnu", here((d, from) => { if (this.isHost) this.applyCanal(from, d); }));
    // someone at a tiller rang their boat's bell
    this.listen("bel", here((_d, from) => { const r = this.remotes.get(from); if (r) SFX.boatBell(...this.hear(r.avatar.x, r.avatar.y + 1.5, r.avatar.z)); }));
    this.listen("trh", here((d, from) => { if (this.isHost) this.applyTrain(from, d); }));
    this.listen("ow", here((d, from) => { if (this.isHost) this.applyCrash(from, d); }));
    this.listen("mk", here((d, from) => this.onMarker(d, from)));
    this.listen("qe", here((d, from) => this.quests.onMessage(d, from)));
    this.listen("bv", here((d, from) => this.invasion.onMessage(d, from)));
    this.listen("no", here((d, from) => this.night.onMessage(d, from)));
    this.listen("scr", here((d, from) => this.scars.onMessage(d, from)));
    // the Chronicle's news day log for this room: everyone's merged, and the host shares what's new
    this.listen("pl", here((d) => { if (Paper.merge(d) && this.isHost) { const pl = Paper.outgoing(); if (pl) this.net.send("pl", pl); } }));
    this.listen("wd", here((d, from) => { if (from === this.hostId && !this.isHost) this.bonfire.apply(d, this.net.selfId); }));
    this.listen("wdq", here((d, from) => { if (this.isHost) this.bonfire.ask(from, d, this.net.selfId); }));
    this.listen("od", here((d, from) => { if (from === this.hostId && !this.isHost) this.oddments.apply(d, this.net.selfId); }));
    this.listen("odq", here((d, from) => { if (this.isHost) this.oddments.ask(from, d, this.net.selfId, [this.woodMe(), ...this.holders()]); }));
    if (world.canal) world.canal.onWater = (i, x, y, z, vol) => this.flowing.set(i, [x, y, z, vol]);
    net.onJoin = (id) => {
      this.hello(id);
      this.voice.join(id);
      if (this.isHost) { this.sendScores(); this.pkT = 0; this.ldT = 0; }
      const mine = this.markers.at(this.net.selfId);
      if (mine) this.net.send("mk", markerMessage(mine), id);
      this.quests.joined(id);
      this.invasion.joined(id);
      this.night.joined(id);
      this.scars.joined(id);
      const pl = Paper.outgoing();
      if (pl) this.net.send("pl", pl, id);
      if (this.isHost) { this.bonfire.joined(id); this.oddments.joined(id); }
    };
    net.onLeave = (id) => {
      const away = this.elsewhere.get(id);
      this.elsewhere.delete(id);
      this.known.delete(id);
      this.markers.clear(id);
      this.since.delete(id);
      const r = this.remotes.get(id);
      if (r) { this.world.scene.remove(r.avatar.root); this.remotes.delete(id); this.notice(`<b style="color:${r.colour}">${esc(r.name)}</b> left the game`, false); }
      // someone in another town isn't drawn here, but they were still in the game
      else if (away) this.notice(`<b>${esc(away.name)}</b> left the game, from ${esc(mapName(away.map))}`, false);
      delete this.scores[id];
      this.voice.drop(id);
      // whatever they were driving is left where it is
      const was = this.vehicles.of(id);
      if (was) { this.seatPerson(was.v, was.seat, ""); if (this.isHost) this.sendVehicles(); }
      if (this.isHost) this.world.canal?.forget(id);
    };
    net.onError = (msg) => this.toast(msg, 6);
    this.hello(undefined, true);   // and ask everyone already here to say hello back

    // the mouse aims only once it's captured: the click that captures it doesn't shoot
    const sig = { signal: this.listeners.signal };
    addEventListener("mousedown", (e) => {
      if (!this.active || this.freeMode || !document.pointerLockElement) return;
      // the full map open: a click puts your marker under the crosshair instead of shooting
      if (!$("bigmap").hidden) { if (e.button === 0 || e.button === 1) this.markAtCursor(); return; }
      if (e.button === 0) this.firing = true;
      if (e.button === 1) { e.preventDefault(); this.markLook(); }   // the middle button marks the spot, as G does
      if (e.button === 2) { this.aiming = !this.aiming; this.binoculars = false; }   // right click toggles aiming
    }, sig);
    addEventListener("mouseup", (e) => {
      if (e.button === 0) this.firing = false;
    }, sig);
    addEventListener("wheel", (e) => {
      if (!this.active || this.freeMode || !e.deltaY) return;
      // the full map open: the wheel zooms it, round the crosshair
      if (!$("bigmap").hidden) {
        const c = this.minimap.cursor;
        if (document.pointerLockElement) this.minimap.zoomFull(e.deltaY < 0 ? 1.25 : 0.8, c?.[0], c?.[1]);
        return;
      }
      this.cycleWeapon(e.deltaY > 0 ? 1 : -1);
    }, { passive: true, signal: this.listeners.signal });
    addEventListener("contextmenu", (e) => e.preventDefault(), sig);
    addEventListener("mousemove", (e) => {
      if (!this.active || this.freeMode || !document.pointerLockElement) return;
      if (!$("bigmap").hidden) { this.moveCursor(e.movementX, e.movementY); return; }
      this.look(e.movementX, e.movementY);
    }, sig);
    addEventListener("keydown", (e) => {
      if (isKey(e.code, "pubcard.go") && this.mapOpen && this.pubMap.isOpen) { if (!e.repeat) this.pubMap.go(); return; }
      if (isKey(e.code, "scores")) { e.preventDefault(); this.dailyT = 0; $("scoreboard").classList.remove("join"); $("scoreboard").hidden = false; this.renderScores(); }
      if (isKey(e.code, "reload") && this.active) this.reload();
      if (this.active && !e.repeat) {
        const n = ["Digit1", "Digit2", "Digit3"].indexOf(e.code);
        // at a bus stop with the menu up, 1 and 2 call a bus rather than switching weapons
        if (BUS_KEYS[e.code] && this.busMenu > performance.now()) this.callBus(BUS_KEYS[e.code]);
        else if (n >= 0) this.switchTo(SLOTS[n], true);
        if (isKey(e.code, "swap")) this.cycleWeapon(1);
      }
      if (this.active && !e.repeat && e.code === "Space") this.kickKey = true;
      if (this.reveal.on && !e.repeat && (e.code === "KeyE" || e.code === "Space" || e.code === "Enter")) { this.reveal.skip(); return; }
      if (this.active && !e.repeat && isKey(e.code, "use")) { this.leaveKey = true; this.useKey = true; }
      // no mouse to click (an iPad's keyboard): Enter shoots, held for a burst, and / aims, again to stop
      if (isKey(e.code, "keyfire") && this.active && !this.mapOpen && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        if (!e.repeat) { this.firing = true; this.shootOnce = true; }
      }
      if (isKey(e.code, "keyaim") && !e.repeat && this.active && !this.mapOpen && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        this.aiming = !this.aiming; this.binoculars = false;
      }
      if (this.active && !e.repeat && this.broadcast.on && e.code !== "Tab" && e.code !== "KeyM") this.anyKey = true;
      if (isKey(e.code, "bino") && !e.repeat && this.active) this.toggleBinoculars();
      if (isKey(e.code, "view") && !e.repeat && this.active && !this.mapOpen && (this.car || this.world.canal?.helmOf(this.net.selfId))) this.toggleView();
      if ((e.code === "ArrowLeft" || e.code === "ArrowRight") && !e.repeat && this.active && this.car) this.indicate(e.code === "ArrowLeft" ? 1 : -1);
      if (isKey(e.code, "ride") && !e.repeat && this.active) this.toggleRide();
      if (e.code === "Backspace" && !e.repeat && this.active && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); this.quests.restart(); }
      if (isKey(e.code, "torch") && !e.repeat && this.active) this.toggleTorch();
      // the back seat's radio has J (and the pad's button) to itself
      if (isKey(e.code, "job") && !e.repeat && this.active && placeNow() !== "back") this.quests.recall();
      if (isKey(e.code, "map") && !e.repeat) this.toggleMap();
      if (this.mapOpen && !e.repeat && (e.code === "Space" || e.code === "KeyC")) { this.player.wantJump = false; this.minimap.centreFull(this.player.pos.x, this.player.pos.z); }
      if (!$("bigmap").hidden && ["Equal", "NumpadAdd", "Minus", "NumpadSubtract"].includes(e.code)) {
        const c = this.minimap.cursor;
        this.minimap.zoomFull(e.code === "Equal" || e.code === "NumpadAdd" ? 1.5 : 1 / 1.5, c?.[0], c?.[1]);
      }
      if (isKey(e.code, "mark") && !e.repeat && this.active) { if (this.mapOpen) this.markUnderPointer(); else this.markLook(); }
      if (isKey(e.code, "radio") && !e.repeat && this.active) this.voice.radio(true);
    }, sig);
    addEventListener("keyup", (e) => {
      if (e.code === "Tab") $("scoreboard").hidden = true;
      if (e.code === "KeyV") this.voice.radio(false);
      if (isKey(e.code, "keyfire")) this.firing = false;
    }, sig);
    addEventListener("blur", () => this.voice.radio(false), sig);
  }

  /** The big map is up. */
  get mapOpen() { return !$("bigmap").hidden; }
  /** Capture the mouse again (main.ts), when the map closes. */
  relock?: () => void;

  toggleMap() {
    const el = $("bigmap");
    el.hidden = !el.hidden;
    // the map works like any other game's: an ordinary pointer to click, drag and zoom with, so the
    // mouse is let go while it's up; a pad keeps it, and steers a cursor of its own with the stick
    if (!el.hidden && document.pointerLockElement && !padInUse()) document.exitPointerLock();
    this.pubMap.close();
    if (el.hidden) {
      const back = this.mapBackTo;
      this.mapBackTo = null;
      this.minimap.pinsBold = false;
      if (back) back();
      else if (!this.freeMode && !document.pointerLockElement) this.relock?.();
    } else {
      this.pubMap.refresh();
      $("bigmapclose").textContent = input() === "touch" ? "Close map" : `Close map (${ctl("map.close")})`;
    }
    this.minimap.hover = null;
    this.mapZoomHeld = 0;
    this.mapHint();
    this.minimap.cursor = null;   // it starts on you, the first time the mouse moves
    this.minimap.resetFull();     // and the whole map shows
    this.mapKey.hideTip();
    this.firing = false;
    this.minePoint = null;
    this.showMine();
  }

  /** "Go to a pub" in the pause menu: the big map, with the pubs at full strength. back: where
   *  closing it without going anywhere takes you (the pause menu again). */
  openPubs(back: () => void) {
    if (!this.mapOpen) this.toggleMap();
    this.minimap.pinsBold = true;
    this.mapBackTo = back;
    $("bigmapclose").textContent = input() === "touch" ? "Back" : `Back (${ctl("map.close")})`;
  }

  /** Esc or the pad's back button with the map up: a pub's card closes first, then the map. */
  mapBack() {
    if (this.pubMap.isOpen) this.pubMap.close();
    else if (this.mapOpen) this.toggleMap();
  }

  // ---- map markers --------------------------------------------------------------------------
  /** Put your marker at scene (x, z) on the ground there (y if known), or take it down (no x), and
   *  tell everyone. what and kind: the thing it's on, if it's on one (markers.ts ITEM_SIZE). */
  private setMarker(x?: number, z?: number, y?: number, what?: string, kind?: string) {
    const me = this.net.selfId;
    if (x === undefined || z === undefined) {
      if (!this.markers.has(me)) return;
      this.markers.clear(me);
      this.net.send("mk", 0);
      this.toast("Marker taken down", 1.5);
      return;
    }
    y ??= this.map.ground(x, z);
    x = Math.round(x * 10) / 10; y = Math.round(y * 10) / 10; z = Math.round(z * 10) / 10;
    this.markers.set(me, x, y, z, this.mapColour(me), what, kind);   // your colour, the same one everyone else sees it in
    this.net.send("mk", markerMessage({ x, y, z, what, kind }));
    if (what) this.toast(`Marked ${what}`, 1.5);
    SFX.tick();
  }

  /** A tap on the full map: a marker there, or, on your own marker, take it down. A finger gets
   *  more room round the icons than a mouse. */
  private markOnMap(clientX: number, clientY: number, finger = false) {
    const r = $("bigmapcanvas").getBoundingClientRect();
    if (r.width) this.markAtFull((clientX - r.left) / r.width, (clientY - r.top) / r.width, finger ? 1.6 : 1);
  }

  /** A click on the full map a fraction (u, v) across and down it. On a pub, its card (pubmap.ts),
   *  to go there or mark it. On anything else drawn there (a job, a challenge, a minigame, a bus
   *  stop, a race's checkpoint), the marker goes exactly on it and says what it is, and on the thing
   *  you've already marked it comes down; on a bunch of jobs, the map zooms in on them (or, zoomed
   *  right in, picks the nearest); on your own marker, it comes down. Anywhere else, it goes where
   *  you clicked. With a pub's card open, a click off it just closes it. */
  private markAtFull(u: number, v: number, reach = 1) {
    let hit = this.minimap.pickAt(u, v, reach);
    if (hit?.kind === "pub") { this.pubMap.pick(hit.wx, hit.wz, u, v); return; }
    if (this.pubMap.isOpen) { this.pubMap.close(); return; }
    const at = this.minimap.fromFullAt(u, v), mine = this.markers.at(this.net.selfId);
    if (hit && hit.cluster >= 0) {
      const one = this.minimap.pickInCluster(hit, u, v);
      if (!one) { this.minimap.zoomFull(2.5, u, v); return; }
      hit = one;
    }
    if (hit?.mine) { this.setMarker(); return; }
    if (hit?.kind) {
      if (mine?.kind && Math.hypot(mine.x - hit.wx, mine.z - hit.wz) < 0.5) this.setMarker();
      else this.setMarker(hit.wx, hit.wz, undefined, hit.name, hit.kind);
      return;
    }
    if (!at) return;
    if (mine && Math.hypot(mine.x - at.x, mine.z - at.z) < 22 * at.mpp) this.setMarker();
    else if (hit) this.setMarker(hit.wx, hit.wz);
    else this.setMarker(at.x, at.z);
  }

  /** G with the map up: a marker under the pad's cursor or the pointer, or with a pub's card open, mark the pub. */
  private markUnderPointer() {
    if (this.pubMap.isOpen) { this.pubMap.markIt(); return; }
    const c = this.minimap.cursor ?? this.minimap.hover;
    if (c) this.markAtFull(c[0], c[1]);
  }

  /** The mouse moving the crosshair over the full map (when it's captured, so there's no pointer). */
  private moveCursor(dx: number, dy: number) {
    const w = $("bigmapcanvas").clientWidth;
    const at = this.minimap.cursor ?? this.minimap.toFull(this.player.pos.x, this.player.pos.z);
    if (!w || !at) return;
    const r = $("bigmapcanvas").getBoundingClientRect(), k = this.mapKey.rect();
    // pushing past the edge of the map slides it along, when it's zoomed in; but with the key
    // beside the map, the crosshair goes on over it, level with it, to reach its switches
    const u = at[0] + dx / w, v = at[1] + dy / w, cv = Math.min(0.98, Math.max(0.02, v));
    const y = r.top + cv * r.height, beside = k.width > 0 && k.right <= r.left && y >= k.top && y <= k.bottom;
    const cu = Math.min(0.98, Math.max(beside ? (k.left + 4 - r.left) / w : 0.02, u));
    this.minimap.panFull(cu - u, cv - v);
    this.minimap.cursor = [cu, cv];
    this.mapKey.pointAt(r.left + cu * r.width, r.top + cv * r.height);
    this.pointMap(r.left + cu * r.width, r.top + cv * r.height);
  }

  /** Touches and an uncaptured mouse on the full map: a tap (or click) marks a spot, a drag moves
   *  the map, two fingers pinch to zoom, and the wheel zooms too. */
  private mapGestures(c: HTMLCanvasElement) {
    const down = new Map<number, { x: number; y: number }>();
    let moved = 0, pinch = 0;
    const frac = (x: number, y: number) => { const r = c.getBoundingClientRect(); return [(x - r.left) / r.width, (y - r.top) / r.width]; };
    c.style.touchAction = "none";
    c.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      c.setPointerCapture(e.pointerId);
      down.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (down.size === 1) moved = 0;
      if (e.pointerType !== "mouse") this.minimap.hover = null;
      if (down.size === 2) { const [a, b] = [...down.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); moved = 99; }
    });
    c.addEventListener("pointermove", (e) => {
      const p = down.get(e.pointerId);
      if (!p) {
        if (e.pointerType !== "mouse") return;
        this.pointMap(e.clientX, e.clientY);
        const [u, v] = frac(e.clientX, e.clientY);
        this.minimap.hover = [u, v];
        c.style.cursor = this.minimap.pickAt(u, v) ? "pointer" : "";
        return;
      }
      const w = c.getBoundingClientRect().width || 1;
      if (down.size === 1) {
        moved += Math.hypot(e.clientX - p.x, e.clientY - p.y);
        // (a few pixels' wobble is still a click, so a drag never drops a marker)
        if (moved > 5) { this.minimap.panFull((e.clientX - p.x) / w, (e.clientY - p.y) / w); c.style.cursor = "grabbing"; }
      } else if (down.size === 2) {
        const [a, b] = [...down.entries()].map(([id, q]) => (id === e.pointerId ? { x: e.clientX, y: e.clientY } : q));
        const d = Math.hypot(a.x - b.x, a.y - b.y), [u, v] = frac((a.x + b.x) / 2, (a.y + b.y) / 2);
        if (pinch > 0 && d > 0) this.minimap.zoomFull(d / pinch, u, v);
        pinch = d;
        this.minimap.panFull((e.clientX - p.x) / w / 2, (e.clientY - p.y) / w / 2);
      }
      p.x = e.clientX; p.y = e.clientY;
    });
    // (a finger lifting leaves too, and what it tapped should stay said)
    c.addEventListener("pointerleave", (e) => {
      if (e.pointerType === "mouse") this.minimap.hover = null;
      if (!down.size && e.pointerType === "mouse") this.pointMap();
    });
    const up = (e: PointerEvent) => {
      if (!down.delete(e.pointerId)) return;
      c.style.cursor = "";
      if (!down.size && moved <= 5 && e.type === "pointerup") {
        this.markOnMap(e.clientX, e.clientY, e.pointerType !== "mouse");
        this.pointMap(e.clientX, e.clientY);
      }
    };
    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", up);
    c.addEventListener("wheel", (e) => {
      if (document.pointerLockElement) return;   // captured, the crosshair is the pointer (see the window's wheel)
      e.preventDefault();
      const [u, v] = frac(e.clientX, e.clientY);
      this.minimap.zoomFull(e.deltaY < 0 ? 1.25 : 0.8, u, v);
    }, { passive: false });
  }

  /** A click on the full map with the mouse captured: your marker under the crosshair (or taken down, if it's on it). */
  private markAtCursor() {
    const c = this.minimap.cursor;
    if (!c) { this.toast(input() === "pad" ? "Move the cursor with the left stick, then {map.mark} to mark" : "Move the mouse to aim, then click to mark", 2); return; }   // keys-ok: the mouse's own way
    // the crosshair on the key: switch that row instead; on a pub's card, press that button
    const r = $("bigmapcanvas").getBoundingClientRect(), px = r.left + c[0] * r.width, py = r.top + c[1] * r.height;
    if (this.mapKey.clickAt(px, py)) return;
    const on = document.elementFromPoint(px, py);
    if (on instanceof HTMLButtonElement && on.closest("#pubcard")) { on.click(); return; }
    if (c[0] < 0) return;   // beside the map, between the key's rows
    this.markAtFull(c[0], c[1]);
  }

  /** G: a marker on whatever you're looking at, or, looking at your own marker, take it down. */
  private markLook() {
    const o = this.camera.position, dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const hit = this.map.raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, MARK_RANGE);
    if (!hit) { this.toast("Too far away to mark", 1.5); return; }
    const p = o.clone().addScaledVector(dir, hit.dist);
    // looking at your own ring on the ground: take it down
    const mine = this.markers.at(this.net.selfId);
    if (mine && Math.hypot(mine.x - p.x, mine.z - p.z) < 4) { this.setMarker(); return; }
    const on = this.minimap.snapNear(p.x, p.z, Math.max(MARK_SNAP, hit.dist * 0.02));
    if (on) this.setMarker(on.x, on.z, undefined, on.name, on.kind);
    else this.setMarker(p.x, p.z, hit.kind === "ground" ? undefined : this.map.ground(p.x, p.z));
  }

  /** Someone else's marker: where it is, or 0 when they take it down. */
  private onMarker(d: unknown, from: string) {
    if (!Array.isArray(d)) { this.markers.clear(from); return; }
    const [x, y, z] = d.slice(0, 3).map(Number);
    if (![x, y, z].every(Number.isFinite)) return;
    const what = typeof d[3] === "string" ? d[3].slice(0, 60) : undefined;
    const kind = typeof d[4] === "string" && Object.hasOwn(ITEM_SIZE, d[4]) ? d[4] : undefined;
    const had = this.markers.at(from);
    const r = this.remotes.get(from), colour = this.mapColour(from);
    this.markers.set(from, x, y, z, colour, what, kind);
    if (what && what !== had?.what) this.toast(`${r?.name ?? "Someone"} marked ${what}`, 2.5);
    if (!had) this.feed(`<b style="color:${colour}">${esc(r?.name ?? "Someone")}</b> ${what ? `marked ${esc(what)}` : "put a marker on the map"}`);
    SFX.tick();
  }

  /** Raise or lower the binoculars. Raising them lowers your gun. */
  /** Switch your torch on or off, and tell everyone straight away. */
  toggleTorch() {
    this.torchOn = !this.torchOn;
    document.getElementById("t-torch")?.classList.toggle("latched", this.torchOn);
    this.sendState();
  }

  toggleBinoculars() {
    if (!this.alive || this.car) return;
    this.binoculars = !this.binoculars;
    if (this.binoculars) { this.aiming = false; this.firing = false; }
  }

  look(dx: number, dy: number) {
    if (this.mapOpen) { const c = this.minimap.cursor; this.minimap.zoomFull(Math.exp(-dy * 0.0008), c?.[0], c?.[1]); return; }
    const zoom = 1 - Math.max(this.weapon.aim * this.weapon.gun.zoom, this.bino * BINO_ZOOM);
    this.player.look(dx, dy, zoom);
    this.lastLook.dx += dx; this.lastLook.dy += dy;
  }

  /** How long the arrow keys have been held down to look round. */
  private arrowHeld = 0;
  /** The arrow keys looking round, with no mouse to do it: slowly at first, for a fine aim, then
   *  quickly enough to turn round. Aiming down the sights slows it, as it does the mouse. */
  private arrowLook(dt: number, on: boolean) {
    const k = this.player.keys;
    const x = on ? (k.has("ArrowRight") ? 1 : 0) - (k.has("ArrowLeft") ? 1 : 0) : 0;
    const y = on ? (k.has("ArrowDown") ? 1 : 0) - (k.has("ArrowUp") ? 1 : 0) : 0;
    if (!x && !y) { this.arrowHeld = 0; return; }
    this.arrowHeld += dt;
    // radians a second, turned into the mouse's units
    const rate = (0.35 + 0.65 * Math.min(1, this.arrowHeld / 0.4)) * dt / this.player.sensitivity;
    this.look(x * rate * 2.4, y * rate * 1.4);
  }

  /** The jump button: walks off the ball if you're lining up a kick, and is the handbrake while driving. */
  jump() {
    if (this.ride) { if (this.car) this.handbrake = true; }
    else if (this.sports.lining) this.leaveKey = true;
    else { this.player.jump(); this.player.jumpHeld = true; }
  }

  /** Your best combo on a ride, in points (0: none yet), for the trophies. */
  bestCombo(kind: RideKind): number { return this.rideTricks.bestCombo(kind); }

  /** The jump button let go: off the handbrake (and a ride's verb let go). */
  jumpEnd() { this.handbrake = false; this.player.jumpHeld = false; }

  /** Get in the vehicle you're next to, or out of the one you're driving (E, or the Car button). */
  useCar() { this.useKey = true; }

  /** Driving: flick the indicators on, left (1) or right (-1), or off again (the left and right arrows, or the touch buttons).
   *  At a narrowboat's tiller the touch buttons wave instead, while held (◀ the left hand, ▶ the right). */
  indicate(d: number) { if (this.car) this.car.indicate(d); else this.waveHeld |= d > 0 ? 1 : 2; }
  /** ◀ or ▶ let go. */
  indicateEnd(d: number) { this.waveHeld &= d > 0 ? 2 : 1; }

  /** Driving: from the driver's own seat, looking out over the dash, or the chase camera behind (C, or View on a touch screen). Remembered on this computer. */
  toggleView() {
    const helm = this.world.canal?.helmOf(this.net.selfId);
    if (helm && !this.car) {
      // at a narrowboat's tiller: from the back deck, or the chase camera, high and well back
      this.boatChase = !this.boatChase;
      try { localStorage.setItem(BOAT_CHASE_KEY, this.boatChase ? "1" : "0"); } catch { /* storage may be blocked */ }
      this.player.yaw = this.world.canal!.stern(helm).yaw;
      this.player.pitch = this.boatChase ? -0.3 : -0.08;
      this.toast(this.boatChase ? "Chase camera" : "On the back deck", 1.2);
      return;
    }
    if (!this.car) return;
    this.inside = !this.inside;
    try { localStorage.setItem(INSIDE_KEY, this.inside ? "1" : "0"); } catch { /* storage may be blocked */ }
    const p = this.player;
    p.yaw = this.car.seat().yaw;
    p.pitch = this.inside ? -0.06 : -0.15;
    this.toast(this.inside ? "Driver's seat" : "Chase camera", 1.2);
  }

  reload() {
    if (this.alive && this.weapon.startReload()) this.reloadSound = SFX.reload(this.weapon.kind === "sniper" ? "sniper" : "rifle");
  }

  /** How far away a point is, and how far to your right (-1 left .. 1 right), for placing sounds. */
  private hear(x: number, y: number, z: number): [number, number] {
    const to = new THREE.Vector3(x, y, z).sub(this.camera.position), d = to.length();
    if (d < 0.01) return [0, 0];
    return [d, to.divideScalar(d).dot(new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion))];
  }

  /** Change weapon (1 fists, 2 rifle, 3 sniper). say: explain if you can't. */
  switchTo(kind: GunKind, say = false) {
    const w = this.weapon;
    if (!this.alive || kind === w.kind) return;
    if (!w.select(kind)) {
      if (say) this.toast(kind === "sniper" ? (w.hasSniper ? "The sniper rifle's empty" : "No sniper rifle yet. It's the blue dot on the map") : "Out of rifle rounds", 1.8);
      return;
    }
    this.aiming = false;
    this.firing = false;
    this.binoculars = false;
    SFX.equip(kind);
  }

  /** Next or previous weapon you can use. */
  cycleWeapon(way: number) {
    if (this.quests.cycle(way)) return;   // watching a race: L1 and R1 switch racer
    const w = this.weapon;
    for (let i = 1; i < SLOTS.length; i++) {
      const k = SLOTS[(SLOTS.indexOf(w.kind) + way * i + SLOTS.length * 2) % SLOTS.length];
      if (w.has(k)) { this.switchTo(k); return; }
    }
  }

  private stopTrophies: () => void = () => {};

  /** For trophies.ts, once a second: where you are, what you're on, and the map and pubs to tick off. */
  private trophyLook(): Trophies.Probe {
    const p = this.player, look = this.telemetryLook();
    return { x: p.pos.x, z: p.pos.z, alive: this.alive, doing: look.doing, flying: !!p.wings && !p.onGround, pubs: this.pubList, map: this.map };
  }

  /** For telemetry.ts, once a second: where you are (data metres) and which ride you're on, if any. */
  telemetryLook() {
    const p = this.player.pos;
    const v = this.ride?.v;
    const doing = !this.alive ? null
      : v ? `ride:${this.ride!.seat === 0 ? "drive" : "pass"}:${v.kind}`
      : this.world.canal?.helmOf(this.net.selfId) ? "ride:boat"
      : this.balloons.aboard >= 0 ? "ride:balloon"
      : this.basket ? "ride:trolley"
      : this.riding && this.held ? `ride:${this.held}`
      : null;
    return { x: p.x, y: -p.z, doing, view: view.fogFar };
  }

  get mapId(): string { return this.map.d.id ?? DEFAULT_MAP; }

  /** Who has said hello: carried across to the new Game when travelling (main.ts's travel). */
  get knownIds(): string[] { return [...this.known]; }

  /** Names of the other players in the room, for the start screen's recent rooms. */
  mateNames(): string[] { return this.allPeers().map((id) => this.remotes.get(id)?.name ?? this.elsewhere.get(id)?.name).filter((n): n is string => !!n); }

  /** Players in this room on the same map. */
  /** Players in this game. Someone on the menu who's only looking for it doesn't count, or they could end up host before they've started. */
  peers(): string[] { return this.net.peers().filter((id) => this.known.has(id) && !this.elsewhere.has(id)); }

  /** Everyone in this game in the room, on your map or elsewhere (a player who's travelled to another
   *  town is still in the match). Used for the one scoreboard and the match host. */
  private allPeers(): string[] { return this.net.peers().filter((id) => this.known.has(id)); }

  /** The match host runs the one scoreboard across every map in the room, so kills and scores follow
   *  you when you travel. The same rule as the map host (whoever's been here longest), but over
   *  everyone in the room, travellers included. With everyone on one map the two are the same player. */
  get matchHostId(): string {
    const at = (id: string) => (id === this.net.selfId ? this.born : this.since.get(id) ?? 0);
    return [this.net.selfId, ...this.allPeers()].sort((a, b) => at(a) - at(b) || (a < b ? -1 : a > b ? 1 : 0))[0];
  }
  get isMatchHost() { return this.matchHostId === this.net.selfId; }

  /** The host is whoever has been here longest (lowest id breaks a tie), so a newcomer with a low id can't take over a game that's already running.
   * A player on an older page, who says no start time, counts as the oldest. */
  get hostId(): string {
    const at = (id: string) => (id === this.net.selfId ? this.born : this.since.get(id) ?? 0);
    return [this.net.selfId, ...this.peers()].sort((a, b) => at(a) - at(b) || (a < b ? -1 : a > b ? 1 : 0))[0];
  }
  get isHost() { return this.hostId === this.net.selfId; }

  /** Take a kind of message for as long as this game lasts. The connection outlives a game when you
   *  take the train to another town, and the town you left mustn't go on answering for you: it would
   *  tell anyone who joined that you're still there, and greet them with its own vehicles. */
  private listen(type: MessageType, fn: (d: any, from: string) => void) {
    this.net.on(type, (d, from) => { if (!this.listeners.signal.aborted) fn(d, from); });
  }

  /** For the debug panel (debug.ts): the map, who's host and the players we know of. */
  debugInfo() {
    const now = performance.now();
    return {
      map: this.map, mapId: this.mapId, host: this.hostId,
      zones: this.zones.describe(this.player.pos.x, this.player.pos.z, this.oddments.filled),
      elsewhere: [...this.elsewhere].map(([id, e]) => ({ id, name: e.name, map: mapName(e.map), seen: now - e.seen })),
      players: [...this.remotes.values()].map((r) => {
        // what they're sat in, by our list and by their word: two that disagree is a body hidden by mistake
        const seat = this.vehicles.of(r.id), said = r.inCar === undefined ? ", their page doesn't say" : r.inCar ? ", they say in" : ", they say out";
        return { id: r.id, name: r.name, seen: now - r.lastSeen, car: seat || r.inCar ? `${seat ? `the ${seat.v.name} (seat ${seat.seat + 1})` : "no seat"}${said}` : "",
          staleSeat: seat && r.inCar === false ? `the ${seat.v.name}` : "", staleFor: r.carOff ?? 0 };
      }),
    };
  }

  // ---- spawning ---------------------------------------------------------------------
  private buildSpawns() {
    const D = this.map.d;
    // everyone starts on Firs Field, the green between North Road, The Firs and The Avenue
    if (D.spawn && D.spawn.length > 2) {
      const ring = D.spawn;
      const inside = (x: number, y: number) => {
        let c = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [xi, yi] = ring[i], [xj, yj] = ring[j];
          if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
        }
        return c;
      };
      const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
      for (let x = Math.min(...xs); x <= Math.max(...xs); x += 3) for (let y = Math.min(...ys); y <= Math.max(...ys); y += 3) {
        if (inside(x, y) && !this.map.blocked(x, -y, 1.2)) this.spawns.push([x, -y]);
      }
    }
    const fallback = !this.spawns.length;
    const ok = (x: number, z: number) => this.map.fieldEdge(x, z) > this.map.field * 0.15 && !this.map.blocked(x, z, 0.8);
    // streets and footpaths, so a park has spawn points across it, not only around its edge
    for (const r of D.rd) {
      for (let i = 0; i < r.p.length; i += 3) {
        const [x, y] = r.p[i];
        if (r.n) this.streets.push({ x, z: -y, n: r.n });
        if (fallback && i % 6 === 0 && ok(x, -y)) this.spawns.push([x, -y]);
      }
    }
    // and the wider map's streets, whose points are further apart: one every 10 m
    for (const r of this.map.wide?.rd ?? []) {
      if (!r.n) continue;
      for (let i = 0; i < r.p.length - 1; i++) {
        const [ax, ay] = r.p[i], [bx, by] = r.p[i + 1], n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 10));
        for (let k = 0; k < n; k++) this.streets.push({ x: ax + (bx - ax) * k / n, z: -(ay + (by - ay) * k / n), n: r.n });
      }
    }
  }

  /** The smallest named place (park, garden, pond...) at data point (x, y), if any. */
  private placeAt(x: number, y: number): Place | undefined {
    return [...this.map.d.pl ?? [], ...this.map.wide?.d.pl ?? []].find((p) => {
      let inside = false;
      for (let i = 0, j = p.r.length - 1; i < p.r.length; j = i++) {
        const [xi, yi] = p.r[i], [xj, yj] = p.r[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    });
  }

  private respawn(at?: { x: number; z: number; yaw: number }) {
    if (this.ride) this.getOut();
    this.dismount();
    this.basket = "";
    this.letGo();
    this.carrier = null;
    const pub = at ? null : this.homePub;
    if (at) {
      this.player.spawn(at.x, at.z, at.yaw);
      // (looked at once its square of Bath is in, which may be now: off a wall or out of a house)
      this.landing = { t: 20 };
    } else if (pub) {
      // back outside the last pub you went to
      const o = this.outside(pub);
      this.player.spawn(o.x, o.z, o.yaw);
      this.landing = this.map.detailedAt(o.x, o.z) ? null : { pub, t: 20 };
    } else {
      const [x, z] = this.spawnSpot();
      this.player.spawn(x, z);
    }
    this.hp = 100;
    this.alive = true;
    this.weapon.reset();
    this.aiming = false;
    this.boostT = 0;
    this.smokeT = 0;
    this.binoculars = false;
    this.claimed.clear();
    this.life++;
    this.blood.stop(this.net.selfId);
    this.sendState();
    if (this.isMatchHost) this.applyRespawn(this.net.selfId, this.life);
    else this.net.send("rs", { life: this.life }, this.matchHostId);
  }

  // ---- going to the pub ---------------------------------------------------------------------
  // Every pub in the force field, with its food hygiene rating, comes from public/maps/<id>-pubs.json
  // (tools/pubs.py), built into the game. On a map without one, it's the pubs signed in the map.

  /** The pubs signed in the detailed map and the squares of Bath loaded: the pavement out front, facing the sign. */
  private signedPubs(): Pub[] {
    const out: Pub[] = [];
    // a sign's local +z faces out, which is (sin a, cos a) in the scene; facing back in is yaw a
    for (const [x, y, , a, , name, style] of this.map.areas().flatMap((m) => m.d.sh ?? [])) {
      if (style === "pub" && name && !out.some((p) => p.name === name)) {
        out.push({ name: String(name), x: +x + Math.sin(+a) * 3, z: -y + Math.cos(+a) * 3, yaw: +a, rating: null });
      }
    }
    return out;
  }

  private loadPubs() {
    this.pubList = this.signedPubs();
    // The lists are small, so they are built into the game: they are there from the first frame and can't
    // go missing on a poor signal. A map with no list keeps the pubs signed in the map.
    const built = BUILT_IN_PUBS[`../public/maps/${this.mapId}-pubs.json`];
    if (built?.pb?.length) this.pubList = built.pb.map(([x, y, name, rating, a]) => ({ name: String(name), x: +x, z: -y, yaw: a ?? undefined, rating: rating ?? null }));
    this.pubsReady = true;
  }

  /** The pubs inside the force field (scene x, z), with how far each is from you. */
  pubs(): { i: number; name: string; rating: number | null; x: number; z: number; far: number }[] {
    const p = this.player.pos;
    return this.pubList
      .map((q, i) => ({ i, name: q.name, rating: q.rating, x: q.x, z: q.z, far: Math.hypot(q.x - p.x, q.z - p.z) }))
      .filter((q) => this.map.fieldEdge(q.x, q.z) > 1);
  }

  /** Everyone's map markers, with whose they are (the jobs' own markers marked as such). */
  private markerList() {
    return this.markers.list(this.net.selfId, (id) => {
      const job = this.marks.get(id);
      if (job) return { name: job.label, colour: job.colour, job: true };
      const r = this.remotes.get(id);
      return { name: r?.name ?? "Player", colour: this.mapColour(id) };
    });
  }

  /** A player's colour on the maps, for their arrow and their markers (markers.ts). */
  private mapColour(id: string): string {
    this.mapIds.length = 0;
    this.mapIds.push(this.net.selfId);
    for (const r of this.remotes.keys()) this.mapIds.push(r);
    return playerColours(this.mapIds).get(id) ?? colourFor(id);
  }
  private mapIds: string[] = [];
  private mapZoomHeld = 0;
  private mapHintText = "";

  /** The line under the big map: just the controls for whatever you're playing with. */
  private mapHint() {
    const text = (this.minimap.pinsBold ? `<b>${ctl("map.mark")}</b> a pub to go there · ` : "") + strip("map") + (input() === "touch" ? " · tap your marker to take it down" : "");
    if (text !== this.mapHintText) { this.mapHintText = text; $("bigmaphint").innerHTML = text; }
  }

  private setTrailLine(key: string | null, pts: number[] | null) {
    if (!key) this.trailLines.clear();
    else if (pts) this.trailLines.set(key, pts);
    else this.trailLines.delete(key);
    this.minimap.pencil = [...this.trailLines.values()].map((p) => ({ pts: p, colour: "#ffd84a", dash: true }));
  }

  /** A pad's button while the map's up: true if the map took it. */
  mapPad(b: number, down: boolean): boolean {
    if (b === PAD.r2 || b === PAD.l2) { this.mapZoomHeld = down ? (b === PAD.r2 ? 1 : -1) : 0; return true; }
    if (!down) return false;
    const is = (id: string) => b === control(id)?.pad;
    if (this.pubMap.isOpen) {
      if (is("pubcard.go")) { this.pubMap.go(); return true; }
      if (is("pubcard.mark")) { this.pubMap.markIt(); return true; }
      if (is("pubcard.back")) { this.pubMap.close(); return true; }
    }
    if (is("map.mark")) { this.markUnderPointer(); return true; }
    if (is("map.close")) { this.toggleMap(); return true; }
    if (is("map.find")) { this.minimap.centreFull(this.player.pos.x, this.player.pos.z); return true; }
    return false;
  }

  /** Each frame with the big map up: the keys and the pad move it, and the pad's cursor. */
  private mapFrame(dt: number) {
    this.mapHint();
    this.pubMap.frame(dt);
    const k = this.player.keys, mm = this.minimap;
    const kx = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
    const ky = (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0) - (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0);
    if (kx || ky) mm.panFull(-kx * dt * 0.7, -ky * dt * 0.7);
    if (this.mapZoomHeld) mm.zoomFull(Math.exp(this.mapZoomHeld * dt * 1.6), mm.cursor?.[0], mm.cursor?.[1]);
    if (!padInUse()) return;
    const j = this.player.joy, m = Math.hypot(j.x, j.y), w = $("bigmapcanvas").clientWidth;
    if (!w) return;
    // the cursor slows over things on the map, and drifts on to one as the stick eases off
    const at = mm.cursor ? mm.magnetAt(mm.cursor[0], mm.cursor[1]) : null;
    if (m > 0.05) this.moveCursor(j.x * w * 0.7 * dt * (at ? 0.45 : 1), j.y * w * 0.7 * dt * (at ? 0.45 : 1));
    else if (!mm.cursor) this.moveCursor(0, 0);
    if (at && mm.cursor && m < 0.5) {
      const f = Math.min(1, dt * 10);
      mm.cursor = [mm.cursor[0] + (at[0] - mm.cursor[0]) * f, mm.cursor[1] + (at[1] - mm.cursor[1]) * f];
    }
  }

  /** How flagged the square at scene (x, z) is today, 0 to 1. */
  flagLevel(x: number, z: number) { return this.invasion.levelAt(x, z); }
  /** What the paper and the big map call the place. Bath's map is named after the village it grew from,
   *  but it's all of Bath now, and the paper has always been the Bath Chronicle. */
  placeName() { return TOWN[this.mapId] ?? this.map.d.name ?? mapName(this.mapId); }
  /** What's yours on the big map, and the line in its corner: what you've done in the square pointed at, or how much of the place is yours. */
  private showMine() {
    if ($("bigmap").hidden) return;
    this.minimap.mine = Yours.mine(this.pubs());
    const at = this.minePoint, tip = at ? Yours.tipAt(at.x, at.z, this.flagLevel(at.x, at.z)) : "";
    const el = $("bigmapmine"), text = tip || Yours.share(this.placeName());
    if (el.textContent !== text) el.textContent = text;
  }
  /** The pointer, the crosshair or a tap is at a page point on the big map (none: it's left). */
  private pointMap(clientX?: number, clientY?: number) {
    const at = clientX === undefined || clientY === undefined ? undefined : this.minimap.fromFull(clientX, clientY);
    this.minePoint = at ? { x: at.x, z: at.z } : null;
    this.showMine();
  }

  /** Where to stand outside a pub that has no sign in the map: on the pavement between it and
   *  the nearest street, facing it. */
  private frontOf(px: number, pz: number): { x: number; z: number; yaw: number } {
    let best = 80, bx = px, bz = pz;
    for (const r of [...this.map.d.rd, ...this.map.wide?.rd ?? []]) {
      if (PATHS.has(r.c)) continue;
      for (let i = 1; i < r.p.length; i++) {
        const ax = r.p[i - 1][0], az = -r.p[i - 1][1], dx = r.p[i][0] - ax, dz = -r.p[i][1] - az;
        const len = dx * dx + dz * dz, t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len)) : 0;
        const qx = ax + dx * t, qz = az + dz * t, d = Math.hypot(px - qx, pz - qz);
        if (d < best) { best = d; bx = qx; bz = qz; }
      }
    }
    // from the middle of the street, up to 5 m towards the door
    const d = Math.hypot(px - bx, pz - bz), k = d > 2 ? Math.min(d - 2, 5) / d : 0;
    const [x, z] = clearSpot(this.map, bx + (px - bx) * k, bz + (pz - bz) * k, 15) ?? [bx, bz];
    return { x, z, yaw: Math.atan2(x - px, z - pz) };
  }

  /** Where to stand outside a pub, out of any building. */
  private outside(pub: Pub): { x: number; z: number; yaw: number } {
    if (pub.yaw === undefined) return this.frontOf(pub.x, pub.z);
    const [x, z] = clearSpot(this.map, pub.x, pub.z) ?? [pub.x, pub.z];
    return { x, z, yaw: pub.yaw };
  }

  /** Of the spawn points, a random sample's spot furthest from everyone else. */
  private spawnSpot(): [number, number] {
    // a map with no spawn ring and no street to stand on (its own name set nothing): start at the
    // force field's centre rather than hand back undefined and fall over
    if (!this.spawns.length) return [this.map.fieldX, this.map.fieldZ];
    const others = [...this.remotes.values()].filter((r) => r.avatar.alive).map((r) => [r.avatar.x, r.avatar.z]);
    let best = this.spawns[0], bestScore = -1;
    for (let i = 0; i < 40; i++) {
      const s = this.spawns[Math.floor(Math.random() * this.spawns.length)];
      const d = others.length ? Math.min(...others.map(([x, z]) => Math.hypot(x - s[0], z - s[1]))) : 100 + Math.random();
      const score = Math.min(d, 160) + Math.random() * 30;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    return best;
  }

  /** Just after going to a pub (or starting somewhere out in Bath), once the square there has loaded:
   *  if you've ended up inside a building after all (or in a wall), out onto the street in front of
   *  the pub, or to where everyone starts. */
  private land(dt: number) {
    const l = this.landing, p = this.player.pos;
    if (!l) return;
    if ((l.t -= dt) < 0 || !this.alive || this.ride) { this.landing = null; return; }
    if (!this.map.detailedAt(p.x, p.z)) return;
    this.landing = null;
    if (p.y > this.map.ground(p.x, p.z) + 1.5) return;   // up on a roof is your own doing
    if (!this.map.indoors(p.x, p.z) && !this.map.blocked(p.x, p.z, 0.35)) return;
    if (l.pub) { const at = this.outside(l.pub); this.player.spawn(at.x, at.z, at.yaw); }
    else {
      // a spot asked for (?at=, or Go to): the nearest clear ground to it, and only failing that
      // where everyone starts
      const [x, z] = clearSpot(this.map, p.x, p.z, 25) ?? this.spawnSpot();
      this.player.spawn(x, z, this.player.yaw);
    }
    this.sendState();
  }

  /** Straight to a spot in the game you're in (the debug panel's Go to, from a ?at= link): scene x, z,
   *  facing yaw and looking up by pitch, as debug.ts reads them. Only you move: everyone else just
   *  sees you there, as when you go to a pub. */
  goToSpot(at: { x: number; z: number; yaw: number; pitch: number }) {
    if (!this.alive) return;
    if (this.ride) this.getOut();
    this.dismount();
    this.player.spawn(at.x, at.z, at.yaw);
    this.player.pitch = at.pitch;
    this.landing = { t: 20 };
    this.sendState();
  }

  /** What's stopping you going to a pub just now, if anything: the pub's card on the big map says it
   *  instead of offering to go. A race or a challenge you're in, or a takeover you're fighting, is yours
   *  to leave, so the card asks; anything else waits till you're clear. */
  travelHold(): TravelHold | null {
    if (!this.alive) return { why: "Wait till you're back on your feet." };
    const now = performance.now(), p = this.player.pos;
    const after = this.afterYou(p.x, p.z);
    if (after) return { why: `${after}. Get clear of them first.` };
    let foe = "", left = 0;
    for (const [id, t] of this.pvp) {
      const l = PVP_HOLD - (now - t), r = this.remotes.get(id);
      if (l <= 0 || !r) this.pvp.delete(id);
      else if (l > left) { left = l; foe = r.name; }
    }
    if (left > 0) return { why: `You and ${foe} have been shooting at each other. Give it ${Math.ceil(left / 1000)} seconds.` };
    if (now - this.hurtAt < HURT_HOLD) return { why: "Not while someone's having a go at you. Get out of the fight first." };
    const job = this.quests.leaving();
    if (job && !job.alone) return { why: `You're in a ${job.what} with everyone else. See it through, or call it off from the pause menu.` };
    if (job) return { why: `You're in a ${job.what}. Going calls it off.`, leave: { yes: `Leave the ${job.what}`, go: () => this.quests.callOff() } };
    const pub = this.invasion.fightNear(p.x, p.z, TAKEOVER_NEAR);
    if (pub) return { why: `The takeover at ${pub} is still on. Leave the lads to it?`, leave: { yes: "Leave the takeover", go: () => {} } };
    return null;
  }

  /** What's hostile, near and after you ("Two naughty boys and a cat are after you"), as every player
   *  draws them: their targets come from the host with the rest of their state. */
  private afterYou(x: number, z: number): string | null {
    const me = this.net.selfId, near = (o: { x: number; z: number }) => Math.hypot(o.x - x, o.z - z) < HOSTILE_NEAR;
    const count = new Map<string, { n: number; one: string; many: string }>();
    const add = ([one, many]: [string, string]) => { const c = count.get(many); if (c) c.n++; else count.set(many, { n: 1, one, many }); };
    for (const c of this.naughtyBoys.living()) if (c.target === me && AFTER_YOU[c.kind] && near(c)) add(AFTER_YOU[c.kind]);
    for (const c of this.cats.living()) if (c.target === me && near(c)) add(["a cat", "cats"]);
    const b = this.bendy.living();
    if (b?.target === me && near(b)) add(["Bendy", "Bendy"]);
    if (!count.size) return null;
    const all = [...count.values()], n = all.reduce((t, c) => t + c.n, 0);
    const parts = all.map((c) => (c.n === 1 ? c.one : `${NUMBERS[c.n] ?? "a crowd of"} ${c.many}`));
    const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
    return `${list[0].toUpperCase()}${list.slice(1)} ${n === 1 ? "is" : "are"} after you`;
  }

  /** You and another player shot at each other just now (a hit, or a shot that passed close). */
  private traded(id: string) {
    if (!this.passive && this.remotes.has(id)) this.pvp.set(id, performance.now());
  }

  /** Go straight to pub i (from pubs()). Returns why not, if you can't just now. */
  goTo(i: number): string | null {
    const pub = this.pubList[i];
    if (!pub) return "That pub isn't on this map.";
    const held = this.travelHold();
    if (held && !held.leave) return held.why;
    const at = this.outside(pub);
    if (this.ride) this.getOut();
    if (this.balloons.aboard >= 0) this.balloons.leave(true);   // over the side: the balloon comes down on its own
    this.player.spawn(at.x, at.z, at.yaw);
    // out in Bath the square there won't have loaded yet, so the spot was picked from the wider
    // map's simpler buildings: look again once it's in
    this.landing = this.map.detailedAt(at.x, at.z) ? null : { pub, t: 20 };
    this.homePub = pub;
    this.aiming = false;
    this.binoculars = false;
    this.sendState();
    this.toast(`Outside ${pub.name}`, 2.5);
    return null;
  }

  // ---- rejoining where you left off ------------------------------------------------------
  private readSpots(): Record<string, { x: number; z: number; yaw: number; t: number }> {
    try { return JSON.parse(localStorage.getItem(SPOT_KEY) ?? "{}") ?? {}; } catch { return {}; }
  }

  private get spotKey() { return `${this.mapId}:${this.room}`; }

  private savedSpot() {
    const s = this.readSpots()[this.spotKey];
    if (!s || !(Date.now() - s.t < SPOT_TTL) || ![s.x, s.z, s.yaw].every(Number.isFinite)) return undefined;
    if (this.map.fieldEdge(s.x, s.z) < 1 || this.map.blocked(s.x, s.z, 0.35)) return undefined;
    return s;
  }

  /** Remember where you are (or forget it while you're dead, so you rejoin at a normal spawn). */
  private saveSpot() {
    const spots = this.readSpots(), now = Date.now();
    for (const k in spots) if (!(now - spots[k]?.t < SPOT_TTL)) delete spots[k];
    const p = this.player.pos;
    if (this.alive) spots[this.spotKey] = { x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10, yaw: Math.round(this.player.yaw * 100) / 100, t: now };
    else delete spots[this.spotKey];
    try { localStorage.setItem(SPOT_KEY, JSON.stringify(spots)); } catch { /* storage may be blocked */ }
  }

  // ---- messages -----------------------------------------------------------------------
  private remote(id: string): Remote {
    let r = this.remotes.get(id);
    if (!r) {
      const colour = colourFor(id);
      r = { id, name: "Player", colour, avatar: new Avatar("Player", colour, id), life: 0, lastSeen: performance.now(), lastShot: -1e9, px: 0, pz: 0, stride: 0, rideCode: 0, grindStyle: 0, level: 0 };
      this.remotes.set(id, r);
      this.world.scene.add(r.avatar.root);
    }
    return r;
  }

  /** You've changed what you're wearing (wardrobe.ts): show everyone. */
  wearChanged() { this.hello(); }

  private hello(to?: string, ask = false) {
    // ro: your treasure-trail rosettes (trail.ts), for others to draw on your jacket; wr: what you're wearing (wardrobe.ts)
    // p: who else you're playing with, so someone joining can wait on the menu until they've met everyone (main.ts)
    const p = this.net.peers().filter((id) => this.known.has(id));
    this.net.send("hello", ask ? { name: this.name, map: this.mapId, t: this.born, ro: myRosettes(), wr: myWear(), p, ask: 1 } : { name: this.name, map: this.mapId, t: this.born, ro: myRosettes(), wr: myWear(), p }, to);
  }

  private onHello(d: { name: string; map?: string; ask?: number; t?: number; ro?: string; wr?: string }, from: string) {
    const name = String(d?.name || "Player").slice(0, 16);
    if (Number.isFinite(d?.t)) this.since.set(from, d.t!);
    if (d?.ask) this.hello(from);
    this.known.add(from);
    if (String(d?.map || DEFAULT_MAP) !== this.mapId) {
      const map = String(d?.map || DEFAULT_MAP), was = this.elsewhere.get(from);
      this.elsewhere.set(from, { name, map, seen: performance.now() });
      if (was?.map === map) return;
      const r = this.remotes.get(from);
      if (r) { this.world.scene.remove(r.avatar.root); this.remotes.delete(from); }
      // they're still in the match: keep their score, just stop drawing them and drop their
      // messages (their map's coordinates mean nothing here)
      if (this.scores[from]) this.scores[from].name = name;
      this.toast(`${name} has gone to ${mapName(map)}. You'll still see their score; take a train to join them.`, 7);
      return;
    }
    // someone whose game has just started: tell them where the vehicles are
    if (d?.ask && this.vhKnown) this.net.send("vh", this.vehicles.snapshot(), from);
    const r = this.remote(from);
    const isNew = r.name === "Player" && name !== "Player";
    if (r.name !== name) { r.name = name; r.avatar.setName(name, r.colour); }
    r.avatar.setRosettes(String(d?.ro ?? ""));
    r.avatar.setWear(String(d?.wr ?? ""));
    // they've come back to our map (they took the train back): draw them again
    if (this.elsewhere.has(from)) {
      this.elsewhere.delete(from);
      this.notice(`<b style="color:${r.colour}">${esc(name)}</b> is back on ${mapName(this.mapId)}`, true);
    } else if (isNew) this.notice(`<b style="color:${r.colour}">${esc(name)}</b> joined the game`, true);
    if (this.scores[from]) this.scores[from].name = name;
  }

  private onState(d: (number | StateExtra)[], from: string) {
    if (!Array.isArray(d) || d.length < 8) return;
    if (this.elsewhere.has(from)) {
      // on another map: their coordinates mean nothing here, so don't draw them, but do let anyone
      // on the radio still be heard in the room (the nearby voice stays off: there's no position)
      this.elsewhere.get(from)!.seen = performance.now();
      this.voice.heard(from, Number(d[8]) || 0);
      return;
    }
    this.known.add(from);
    const r = this.remote(from);
    const [x, y, z, yaw, pitch, crouch, alive, life, talk, prone = 0, torch = 0, rc = 0] = d.slice(0, 12).map(Number);
    r.torch = torch === 1;
    r.rideCode = Number(rc) || 0;
    const e = stateExtra(d);
    // the game's passive mode, from the host. Only take it from someone who says they're host: a
    // newcomer can look like the host for a moment, before we've heard how long they've been here.
    // A host on a page from before passive mode says nothing, which means off.
    if (from === this.hostId && (e?.host ?? true)) { this.setRoomPassive(!!e?.passive); this.setRoomFeatures(unpackFeatures(e?.ft) ?? myFeatures); }
    r.avatar.setWings(!!e?.wings, !!e?.glow);
    r.smoking = !!e?.smoke;
    r.waiting = !!e?.rw;
    r.avatar.setRage(r.smoking);
    // whether they're in a vehicle, by their own word (undefined from pages that don't say)
    r.inCar = e?.car;
    r.grindStyle = e?.gr ?? 0;
    r.avatar.wave = e?.wv ?? 0;
    r.level = e?.vl ?? 0;
    r.lastSeen = performance.now();
    this.voice.heard(from, talk);
    if (life !== r.life) { r.life = life; r.avatar.teleport(); this.blood.stop(from); }
    if (this.isHost) this.catchUpLife(from, life);
    r.avatar.alive = alive === 1 && life !== r.deadLife;
    // riding a cable car cabin, they send where they are in it as well: draw them in our cabin there, so
    // they go along with it rather than trailing and running after it (and older pages just use x, y, z)
    const [cab, cx, cy, cz] = this.world.cableway && e?.cab ? e.cab : [0, 0, 0, 0];
    // and in a balloon's basket the same, so they go up with it
    const [bal, bx, by, bz] = !cab && e?.bal && this.balloons.base(e.bal[0]) ? e.bal : [0, 0, 0, 0];
    if (cab !== r.cab || bal !== r.bal) {
      r.cab = cab; r.bal = bal; r.avatar.restart();
      r.avatar.base = cab ? this.world.cableway!.cabinAt(cab) : bal ? this.balloons.base(bal) : null;
    }
    if (cab) r.avatar.push({ t: performance.now(), x: cx, y: cy, z: cz, yaw, pitch, crouch, prone });
    else if (bal) r.avatar.push({ t: performance.now(), x: bx, y: by, z: bz, yaw, pitch, crouch, prone });
    else r.avatar.push({ t: performance.now(), x, y, z, yaw, pitch, crouch, prone });
  }

  private onShot(d: number[], from: string) {
    const r = this.remotes.get(from);
    if (!r || !Array.isArray(d)) return;
    r.lastShot = performance.now();
    r.avatar.fire();
    const o = new THREE.Vector3(d[0], d[1], d[2]), e = new THREE.Vector3(d[3], d[4], d[5]);
    const sniper = d[7] === 1;
    SFX.shot(...this.hear(o.x, o.y, o.z), sniper);
    if (!gore()) {
      const mark = d[6], col = paintFor(colourFor(from));
      // on a car: it lands where it hit the car, wherever the car's got to
      let body: OnBody | null = null, on: Follow | null = null;
      const len = e.distanceTo(o), dir = e.clone().sub(o).divideScalar(len || 1);
      if (mark === 1) {
        const h = this.map.raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, len + 0.5);
        if (h && h.dist > len - 1.5) body = this.paintOnCar(o, dir, h);
        if (body) on = follow(body.part, body.part.localToWorld(body.p.clone()));
      } else if (mark === 2) on = this.follower(o, dir, len);   // someone: it goes after them, and bursts on them
      const at = on;
      this.effects.paintball(o, e, col, sniper ? PAINT_SPEED_SNIPER : PAINT_SPEED,
        mark ? () => this.paintLands(o, at && !body ? at() : e, mark, col, sniper, undefined, undefined, body, at?.obj) : undefined, on ?? undefined, sniper);
    } else {
      this.effects.tracer(o, e, sniper ? "#fff4d0" : "#ffc070", sniper ? 0.35 : 0.07);
      if (d[6] === 2) this.goreHit(e, e.clone().sub(o).normalize(), false, sniper);
      else if (d[6]) this.effects.impact(e, new THREE.Vector3(0, 1, 0), "#cfc4a8", 4);
      if (d[6]) SFX.impact(d[6] === 2 ? "body" : e.y - this.map.ground(e.x, e.z) < 0.2 ? "ground" : "building", ...this.hear(e.x, e.y, e.z), sniper);
    }
    // a round that came close: where along the shot did it pass nearest to you?
    const cam = this.camera.position, line = e.clone().sub(o), len = line.length();
    if (len > 4) {
      const along = Math.max(0, Math.min(len, cam.clone().sub(o).dot(line.divideScalar(len))));
      const near = o.clone().addScaledVector(line, along);
      const [miss, pan] = this.hear(near.x, near.y, near.z);
      if (along > 3 && along < len - 0.5 && this.alive) SFX.whiz(miss, pan, sniper);
      if (d[6] !== 2 && along > 1 && near.distanceTo(cam) < SHOT_NEAR) this.traded(from);
    }
  }

  private onEvent(d: any) {
    const me = this.net.selfId;
    Telemetry.matchEvent(d.k, d.by === me, d.t === me);
    const nameOf = (id: string) => (isGang(id) ? GANG_NAME[id] : id === me ? this.name : this.remotes.get(id)?.name ?? this.scores[id]?.name ?? "Someone");
    const colOf = (id: string) => (isGang(id) ? "#d8d8d8" : id === me ? "#e3a33b" : colourFor(id));
    const who = (id: string) => `<b style="color:${colOf(id)}">${esc(nameOf(id))}</b>`;
    if (d.k === "dmg" && d.t === me && d.life === this.life) {
      this.traded(d.by);
      this.broadcast.skip();   // never watching the telly while someone's hitting you
      this.hp = d.hp;
      this.hurtT = 0.5;
      this.hurtAt = performance.now();
      SFX.hurt();
      rumble(0.6, 0.4, 160);
      // splattered: the edges of the screen go the colour of their paint
      const paint = gore() ? null : paintOf(d.by);
      $("vignette").style.background = paint ? `radial-gradient(ellipse at center, transparent 45%, ${paint}a0)` : "";
      if (isGang(d.by)) { this.player.yaw += (Math.random() - 0.5) * 0.08; this.player.pitch += 0.03; }   // knocked about
    }
    if ((d.k === "dmg" || d.k === "kill") && d.t !== me) {
      const v = this.posOf(d.t);
      if (v) (d.k === "kill" ? SFX.groan : SFX.grunt)(...this.hear(v.x, v.y + 1.6, v.z), voiceOf(d.t));
    }
    if ((d.k === "dmg" || d.k === "kill") && (!isGang(d.by) || d.by === "cat" || d.by === "bendy") && !d.m) {
      const v = this.posOf(d.t), from = this.posOf(d.by);
      if (v) {
        this.blood.hit(d.t, v.x, v.z, from?.x ?? v.x, from?.z ?? v.z, !!d.h, paintOf(d.by));
        if (d.k === "kill") this.bodyPool(v.x, v.z, v.yaw, 1, paintOf(d.by));
      }
    }
    if (d.k === "kill") {
      const head = d.h ? " (headshot)" : "";
      const how = isGang(d.by) ? GANG_HOW[d.by] : d.m ? "battered" : d.w === RUN ? "ran over" : d.w === 2 ? "sniped" : gore() ? "shot" : "splatted";
      this.feed(`${who(d.by)} ${how} ${who(d.t)}${d.by === "cricket" ? " for six" : ""}${head}`);
      if (d.t === me && d.life === this.life) {
        if (this.ride) this.getOut();
        this.hp = 0;
        this.alive = false;
        this.deadFor = 0;
        this.killer = nameOf(d.by);
        this.firing = false;
        this.reloadSound?.stop();
        SFX.groan(0, 0, voiceOf(me));
      }
      if (d.by === me && d.t !== me) { Trophies.tally("kills"); SFX.kill(); Quips.kill(false); this.toast(`You ${d.m ? "battered" : d.w === RUN ? "ran over" : gore() ? "shot" : "splatted"} ${nameOf(d.t)}`, 1.5); }
      const r = this.remotes.get(d.t);
      if (r) { r.avatar.alive = false; r.deadLife = d.life; }
    }
    if (d.k === "cdmg" || d.k === "ckill") {
      const c = this.naughtyBoys.at(d.c), from = this.posOf(d.by);
      if (c && c.gen === d.g) (d.k === "ckill" ? SFX.groan : SFX.grunt)(...this.hear(c.x, c.y + 1.6, c.z), c.voice);
      if (c && c.gen === d.g && !d.m) {
        this.blood.hit(c.key, c.x, c.z, from?.x ?? c.x, from?.z ?? c.z, !!d.h, paintOf(d.by));
        if (d.k === "ckill") this.bodyPool(c.x, c.z, c.yaw, -1, paintOf(d.by));
      }
      if (d.k === "ckill") {
        this.naughtyBoys.killed(d.c, d.g);
        const them = DECKED[c?.kind ?? NAUGHTY] ?? DECKED[NAUGHTY];
        const how = d.w === RUN ? "ran over" : d.w === BLAST ? "sent flying" : d.m ? "decked" : gore() ? anyOf(NAUGHTY_DOWN) : anyOf(["splatted", "painted", "tagged", "decked"]);
        this.feed(`${who(d.by)} ${how} ${them}${d.h ? " (headshot)" : ""}`);
        if (d.by === me) { Trophies.tally("kills"); SFX.kill(); Quips.kill(true); this.toast(`You ${how} ${them}`, 1.5); if ((c?.kind ?? NAUGHTY) === NAUGHTY) noteDaily("naughty"); }
      }
    }
    if (d.k === "kdmg" || d.k === "kkill") {
      const c = this.cats.at(d.c), from = this.posOf(d.by);
      if (c && c.gen === d.g) {
        SFX.yelp(...this.hear(c.x, c.y + 0.3, c.z), c.voice, d.k === "kkill");
        if (!d.m) this.blood.hit(c.key, c.x, c.z, from?.x ?? c.x, from?.z ?? c.z, !!d.h, paintOf(d.by));
      }
      if (d.k === "kkill") {
        this.cats.killed(d.c, d.g);
        const how = (d.w === RUN ? "ran over {c}" : d.m ? "punched out {c}" : anyOf(gore() ? CAT_DOWN : CAT_PAINT)).replace("{c}", "a cat");
        this.feed(`${who(d.by)} ${how}${d.h ? " (headshot)" : ""}`);
        if (d.by === me) { SFX.kill(); this.toast(`You ${how}`, 1.2); }
      }
      if (d.first && d.by === me && this.furyT <= 0) {
        this.toast(`Oh no. The cats. ALL the cats. Run! Get ${ESCAPE} m away and they'll give up`, 3.5);
        SFX.alarm();
        this.furyT = 25;
        this.swarmLife = this.life;
        this.catsFrom = { x: this.player.pos.x, z: this.player.pos.z, t: 3.5 };
      }
    }
    if (d.k === "bdmg" || d.k === "bkill") {
      const b = this.bendy.at();
      if (b.gen === d.g) SFX.bellow(d.k === "bkill", ...this.hear(b.x, b.y + 3.5, b.z));
      if (d.k === "bkill") {
        this.bendy.killed(d.g);
        this.feed(`${who(d.by)} ${d.w === RUN ? "ran over" : d.w === BLAST ? "blew up" : "killed"} Bendy${d.h ? " (headshot)" : ""}`);
        if (d.by === me) { SFX.kill(); Quips.kill(true); }
        this.toast(d.by === me ? "You killed Bendy!" : `${nameOf(d.by)} killed Bendy`, 3);
      }
    }
    if (d.k === "pick") this.onPick(d);
    if (d.k === "bus" && d.t === me) this.onBus(d);
    if (d.k === "conv" && Number.isFinite(d.x) && Number.isFinite(d.z)) {
      const [dist, pan] = this.hear(d.x, this.map.ground(d.x, d.z) + 4, d.z), prize = PRIZE[d.kind as Kind] ?? "a prize";
      const game = this.map.pitch(d.p)?.[0];
      if (game === "c") {
        Posh.speak("Howzat!", voiceOf(d.by), dist);
        this.feed(`${who(d.by)} bowled one through the stumps`);
        if (d.by === me) this.toast(`Bowled! ${prize} behind the stumps`, 3);
      } else if (game === "f") {
        SFX.whistle(dist, pan);
        this.feed(`${who(d.by)} scored${d.h ? " from the edge of the box" : " from the spot"}`);
        if (d.by === me) this.toast(`GOAL! ${prize} in the goalmouth`, 3);
      } else {
        SFX.whistle(dist, pan);
        this.feed(`${who(d.by)} kicked one over the posts${d.h ? " from way out" : ""}`);
        if (d.by === me) this.toast(`Over! ${prize} under the posts`, 3);
      }
    }
  }

  /** Someone took a pickup. If it was us, have it. */
  private onPick(d: { i: number; kind: Kind; t: string; life: number; hp?: number }) {
    this.pickups.take(d.i);
    this.claimed.delete(d.i);
    if (d.kind === "sniper" && d.t !== this.net.selfId) {
      const r = this.remotes.get(d.t);
      if (r) this.feed(`<b style="color:${r.colour}">${esc(r.name)}</b> picked up the sniper rifle`);
    }
    if (d.t !== this.net.selfId || d.life !== this.life || !this.alive) return;
    const w = this.weapon;
    SFX.pickup(d.kind);
    Quips.pickup(d.kind);
    if (d.kind === "pint") { this.hp = d.hp ?? this.hp; this.toast(`Cheers! +${PINT_HEAL} health`, 1.8); noteDaily("pint"); Trophies.tally("pints"); }
    if (d.kind === "fizz") { this.hp = d.hp ?? 100; this.toast("Co-op Bucks Fizz: full health", 2); }
    if (d.kind === "boost") { this.boostT = BOOST_SECONDS; this.toast(`Lucozade: double damage for ${BOOST_SECONDS} seconds`, 2.5); }
    if (isRide(d.kind)) this.giveRide(d.kind);
    if (d.kind === "ladder" && !this.tookLadder()) this.toast("A ladder! Face a building and press {ride} to put it up to the roof", 3.5);
    if (d.kind === "ammo") {
      w.reserve = Math.min(MAX_RESERVE, w.reserve + AMMO_PICKUP);
      this.toast(`+${AMMO_PICKUP} rifle rounds`, 1.5);
      if (w.kind === "fists") this.switchTo("rifle");
    }
    if (d.kind === "sammo") {
      w.sniperReserve = Math.min(SNIPER_MAX_RESERVE, w.sniperReserve + SNIPER_PICKUP);
      this.toast(`+${SNIPER_PICKUP} sniper rounds`, 1.5);
    }
    if (d.kind === "sniper" && w.hasSniper) {
      w.giveSniper();
      this.toast(`+${GUNS.sniper.mag} sniper rounds`, 1.5);
    } else if (d.kind === "sniper") {
      w.giveSniper();
      this.aiming = false;
      this.toast(input() === "keys" ? "Sniper rifle: 10 rounds. {aim} for the scope, {sniper} to pick it, {rifle} for the rifle" : "Sniper rifle: 10 rounds. {aim} for the scope, {swap} to change weapon", 3.5);
      this.feed(`You picked up the sniper rifle`);
    }
  }

  /** Could we use this pickup right now? Otherwise, why not. */
  private wants(kind: Kind): true | string {
    const w = this.weapon;
    if (kind === "boost") return true;
    // one thing to carry, a ride or a ladder: another swaps for it (you leave the one you had there)
    if (isRide(kind)) return kind !== this.held || `You've already got ${rideSpecs[kind].name}`;
    if (kind === "ladder") return !this.ladders.carriers.has(this.net.selfId) || "You've already got a ladder";
    if (kind === "pint" || kind === "fizz") return this.hp < 100 || "You're at full health. Save it for later";
    if (kind === "ammo") return w.reserve < MAX_RESERVE || "You can't carry any more rifle rounds";
    if (kind === "sammo") return !w.hasSniper ? "Sniper rounds: you need the sniper rifle first" : w.sniperReserve < SNIPER_MAX_RESERVE || "You can't carry any more sniper rounds";
    return !w.hasSniper || w.sniperReserve < SNIPER_MAX_RESERVE || "You can't carry any more sniper rounds";
  }

  /** Walk over pickups to ask the host for them. */
  private grab() {
    const p = this.player.pos, slot = this.carrying();
    this.swapAt = null;
    for (const it of this.pickups.near(p.x, p.y, p.z)) {
      // hands full with something else: it waits for E (useSwap)
      if (slot && slot !== it.kind && (isRide(it.kind) || it.kind === "ladder")) { this.swapAt ??= it; continue; }
      const ok = this.wants(it.kind);
      if (ok !== true) {
        if (this.hintT <= 0 && this.toastT <= 0) { this.toast(ok, 2); this.hintT = 6; }
        continue;
      }
      this.claim(it);
    }
  }

  /** Ask the host for a pickup. drop: the ride we're leaving where it was, for it. */
  private claim(it: Item, drop?: RideKind) {
    const now = performance.now();
    if (now - (this.claimed.get(it.id) ?? -1e9) < 1000) return;
    this.claimed.set(it.id, now);
    const claim = { i: it.id, life: this.life, drop };
    if (this.isHost) this.applyPick(this.net.selfId, claim);
    else this.net.send("pick", claim, this.hostId);
  }

  /** What you're carrying in your one slot: a ride, the ladder, one of the strange objects, or nothing. */
  private carrying(): RideKind | "ladder" | "odd" | null {
    return this.held ?? (this.ladders.carriers.has(this.net.selfId) ? "ladder" : this.oddments.carrying(this.net.selfId) ? "odd" : null);
  }

  /** E over a ride or a ladder with your hands full: swap what you've got for it. Returns true if E was for that. */
  private useSwap(): boolean {
    const it = this.swapAt;
    if (!it || !this.alive || this.basket || this.player.ladder || !this.pickups.items.has(it.id)) return false;
    this.claim(it, this.held ?? undefined);
    return true;
  }

  /** Where a player is, as this player sees them. */
  /** The game's passive mode changed (the host's say): tell the player. */
  /** The zones, the strange objects and the challenges as the host has them: whatever's changed comes or goes. */
  private setRoomFeatures(f: Features) {
    if (!setFeatures(f).length) return;
    this.oddments.switched();
    this.quests?.repost();
    this.mapKey.showFeatures();
    this.minimap.spots = this.gameSpots();
  }

  private setRoomPassive(on: boolean) {
    if (on === this.passive) return;
    this.passive = on;
    this.toast(on ? "Passive mode is on for this game: nothing will come for you" : "Passive mode is off for this game", 3);
  }

  private posOf(id: string): { x: number; y: number; z: number; yaw: number } | null {
    if (id === this.net.selfId) { const p = this.player; return { x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw }; }
    const a = this.remotes.get(id)?.avatar;
    return a ? { x: a.x, y: a.y, z: a.z, yaw: a.yaw } : null;
  }

  /** A pool spreads under the chest of a body that fell forwards (1) or backwards (-1) from facing yaw (or the winner's paint does). */
  private bodyPool(x: number, z: number, yaw: number, way: number, paint: string | null) {
    this.blood.pool(x - Math.sin(yaw) * 0.9 * way, z - Math.cos(yaw) * 0.9 * way, paint);
  }

  /**
   * Blood on: a round going into someone at `at`, travelling along dir. Blood sprays out of the
   * far side and a little back at you, goes up the wall behind them if there's one close, and a
   * headshot or a sniper round leaves a red mist hanging.
   */
  private goreHit(at: THREE.Vector3, dir: THREE.Vector3, head: boolean, heavy: boolean) {
    const big = head || heavy;
    this.effects.splash(at, dir, "#8a0a0a", big ? 24 : 12);
    this.effects.splash(at, dir.clone().negate(), "#6a0606", big ? 6 : 3);
    if (big) this.effects.mist(at, "#a01010");
    const h = this.map.raycast(at.x, at.y, at.z, dir.x, dir.y, dir.z, big ? 5 : 3);
    if (h && h.kind !== "ground") this.blood.mark(at.clone().addScaledVector(dir, h.dist), new THREE.Vector3(h.nx, h.ny, h.nz), null, big);
  }

  /**
   * Paintball: a paintball from `from` has reached `at`, where it hit a surface (mark 1) or
   * someone (2). It bursts in a spray of its colour, and leaves a splat on a wall or the ground.
   * n is the way the surface faces, if known; otherwise it's found by looking along the shot.
   * body: the spot on a vehicle it hit, which may have moved since: the splat goes on it there.
   */
  private paintLands(from: THREE.Vector3, at: THREE.Vector3, mark: number, colour: string, heavy: boolean, n?: THREE.Vector3, kind?: "building" | "barrier" | "tree" | "ground", body?: OnBody | null, victim?: THREE.Object3D) {
    if (body) {
      body.root.updateMatrixWorld(true);
      at = body.part.localToWorld(body.p.clone());
      const out = body.n.clone().transformDirection(body.part.matrixWorld);
      this.effects.splash(at, out, colour, heavy ? 5 : 7, heavy);
      this.blood.stick(body, colour);
      SFX.impact("barrier", ...this.hear(at.x, at.y, at.z), heavy, true);
      return;
    }
    const dir = at.clone().sub(from).normalize();
    if (!n && mark === 1) {
      const h = this.map.raycast(at.x - dir.x * 0.5, at.y - dir.y * 0.5, at.z - dir.z * 0.5, dir.x, dir.y, dir.z, 1.5);
      n = h ? new THREE.Vector3(h.nx, h.ny, h.nz) : new THREE.Vector3(0, 1, 0);
      kind ??= h?.kind;
    }
    const out = n ?? dir.clone().negate();
    this.effects.splash(at, out, colour, (mark === 2 ? 10 : 7) - (heavy ? 3 : 0), heavy);
    // the splat stays on whoever it hit and goes where they go
    const sticks = mark === 2 && victim && onBody(victim, at.clone().addScaledVector(dir, -0.6), dir, 1.6);
    if (sticks) this.blood.stick(sticks, colour);
    if (mark === 1) this.blood.mark(at, out, colour, heavy, dir);
    const sound = mark === 2 ? "body" : kind ?? (at.y - this.map.ground(at.x, at.z) < 0.2 ? "ground" : "building");
    SFX.impact(sound, ...this.hear(at.x, at.y, at.z), heavy, true);
  }

  /**
   * Who or what a shot from o along unit d hit, dist along it, if it's someone or something that
   * moves (a naughty boy, a cat, a gull, a player): the spot on them it hit, wherever they get to,
   * for the paintball to follow and burst on. One place for every shot, yours and everyone else's.
   */
  private follower(o: THREE.Vector3, d: THREE.Vector3, dist: number): Follow | null {
    const near = dist + 0.75, at = o.clone().addScaledVector(d, dist);
    const c = this.naughtyBoys.hit(o, d, near), k = this.cats.hit(o, d, near), q = this.quests.hit(o, d, near);
    const found: [{ dist: number } | null, () => Follow | null][] = [
      [c, () => this.naughtyBoys.follow(c!.i, at)],
      [k, () => this.cats.follow(k!.i, at)],
      [q, () => q?.follow ?? null],
      ...[...this.remotes.values()].map((r) => [r.avatar.hit(o, d), () => r.avatar.follow(at)] as [{ dist: number } | null, () => Follow]),
    ];
    // the one it hit is the one where the shot ended
    let best: (() => Follow | null) | null = null, off = 0.75;
    for (const [h, f] of found) if (h && Math.abs(h.dist - dist) < off) { off = Math.abs(h.dist - dist); best = f; }
    return best?.() ?? null;
  }

  /** If a paintball from o along unit d has hit a vehicle (h, from map.raycast), the spot on its body it hits. */
  private paintOnCar(o: THREE.Vector3, d: THREE.Vector3, h: RayHit | null): OnBody | null {
    const m = h?.mover;
    if (!m?.root) return null;
    const hit = onBody(m.root, o, d, h!.dist + 2 * (m.hl + m.hw));
    if (hit) return hit;
    // it clipped a corner of the box where the body's rounded off: put it on the panel just inside
    const at = o.clone().addScaledVector(d, h!.dist), into = new THREE.Vector3(-h!.nx, -h!.ny, -h!.nz);
    return onBody(m.root, at.addScaledVector(into, -0.05), into, 2 * m.hw);
  }

  private onScores(d: Record<string, Score>) {
    const mine = this.scores[this.net.selfId];
    this.scores = d;
    const s = d[this.net.selfId];
    if (s && s.life === this.life) this.hp = s.hp;
    else if (mine) this.scores[this.net.selfId] = { ...mine, k: s?.k ?? mine.k, d: s?.d ?? mine.d, c: s?.c ?? mine.c };
    if (!$("scoreboard").hidden) this.renderScores();
  }

  // ---- host rules --------------------------------------------------------------------------
  private entry(id: string): Score {
    return (this.scores[id] ??= { name: id === this.net.selfId ? this.name : this.remotes.get(id)?.name ?? "Player", k: 0, d: 0, c: 0, hp: 100, alive: true, life: 0 });
  }

  /** Lives only go up. If a player is on a newer life than the host knew, their respawn message was missed. */
  private catchUpLife(id: string, life: number) {
    const s = this.entry(id);
    if (life > s.life) { Object.assign(s, { hp: 100, alive: true, life }); this.sendScores(); }
  }

  /** How much a hit does: a weapon's damage (x: 2 while the shooter's on Lucozade), or being run over at speed s. */
  private hitDamage(d: { head: boolean; w?: number; x?: number; s?: number }) {
    if (d.w === BLAST) return Math.round(Math.min(BLAST_HIT, Math.max(0, Number(d.s) || 0)));
    return d.w === RUN ? runDamage(d.s ?? 0) : damage(SLOTS[d.w ?? 1] ?? "rifle", d.head) * (d.x === 2 ? 2 : 1);
  }

  private applyHit(from: string, d: { t: string; head: boolean; life: number; w?: number; x?: number; s?: number }) {
    this.catchUpLife(d.t, d.life);
    if (!this.entry(from).alive || d.t === from) return;
    this.hurt(d.t, this.hitDamage(d), from, d.head, d.life, d.w);
  }

  /** Someone scored a goal, kicked one over the posts or bowled the stumps over: put a prize by them, and tell everyone. h: a hard one. */
  private applyConv(from: string, d: { p: number; e: number; h?: number }) {
    const at = this.sports.goalSpot(d?.p, d?.e), now = performance.now();
    if (!at || now - (this.convAt.get(from) ?? -1e9) < CONV_GAP) return;
    this.convAt.set(from, now);
    const kind = this.pickups.bonus(at[0], at[1], d.h === 1);
    this.broadcastEvent({ k: "conv", by: from, kind, p: d.p, h: d.h === 1 ? 1 : 0, x: Math.round(at[0] * 10) / 10, z: Math.round(at[1] * 10) / 10 });
    this.net.send("pk", this.pickups.snapshot());
  }

  /** Hand a pickup to whoever asked first, and tell everyone. */
  private applyPick(from: string, d: { i: number; life: number; drop?: RideKind }) {
    const it = this.pickups.items.get(d?.i), s = this.entry(from);
    if (!it || !s.alive || s.life !== d.life) return;
    const e: Record<string, unknown> = { k: "pick", i: it.id, kind: it.kind, t: from, life: d.life };
    if (it.kind === "ladder") {
      if (this.ladders.carriers.has(from)) return;
      this.ladders.give(from);
      this.ldT = 0;
    }
    if (d.drop && isRide(d.drop) && (it.kind === "ladder" || isRide(it.kind))) this.pickups.place(it.x, it.z, d.drop, LEFT_LIFE);   // the ride they had stays here
    if (it.kind === "pint" || it.kind === "fizz") {
      if (s.hp >= 100) return;
      s.hp = it.kind === "fizz" ? 100 : Math.min(100, s.hp + PINT_HEAL);
      e.hp = s.hp;
    }
    this.broadcastEvent(e);
    this.net.send("pk", this.pickups.snapshot());
    if (e.hp !== undefined) this.sendScores();
  }

  /** Take health off a player and tell everyone. by is the shooter's id, or one of GANG. w is the weapon slot. */
  private hurt(id: string, amount: number, by: string, head: boolean, life: number, w?: number) {
    const target = this.entry(id);
    if (!target.alive || target.life !== life) return;
    if (isGang(by) && !ACCIDENTS.has(by) && this.passive) return;   // passive mode: nothing the game runs lands a blow
    if (GANG.includes(by) && this.world.canal?.helmOf(id)) return;   // at a narrowboat's tiller: the gangs can't touch you
    if (id === this.net.selfId ? this.smokeT > 0 : this.remotes.get(id)?.smoking) return;   // smoking one of Jamie's (jamie.ts): nothing touches them
    if (id === this.net.selfId ? this.quests.waiting() : this.remotes.get(id)?.waiting) return;   // out of a race, watching the others finish
    target.hp = Math.max(0, target.hp - amount);
    if (target.hp <= 0) {
      target.alive = false;
      target.d++;
      if (!isGang(by)) this.entry(by).k++;
      this.broadcastEvent({ k: "kill", t: id, by, h: head, life, w, m: w === 0 ? 1 : 0 });
    } else {
      this.broadcastEvent({ k: "dmg", t: id, by, h: head, hp: target.hp, life, w, m: w === 0 ? 1 : 0 });
    }
    this.sendScores();
  }

  /** fx, fz: where a blast went off, for him to run away from (rather than from whoever set it off);
   *  a: the heading of the car that ran him over, so he runs off square to it. */
  private applyNaughtyBoyHit(from: string, d: { c: number; g: number; head: boolean; w?: number; x?: number; s?: number; a?: number; fx?: number; fz?: number }) {
    const shooter = this.entry(from);
    if (!shooter.alive) return;
    const at = this.posOf(from);
    const away = d.fx !== undefined && d.fz !== undefined ? { x: d.fx, z: d.fz } : at ? { x: at.x, z: at.z, a: d.w === RUN ? Number(d.a) : undefined } : undefined;
    const res = this.naughtyBoys.damage(d.c, d.g, this.hitDamage(d), away);
    if (!res) return;
    if (at && !this.passive) this.naughtyBoys.aggro(d.c, from, at.x, at.z);
    this.broadcastEvent({ k: res === "kill" ? "ckill" : "cdmg", c: d.c, g: d.g, by: from, h: d.head, m: d.w === 0 ? 1 : 0, w: d.w });
    if (res === "kill") {
      shooter.c = (shooter.c ?? 0) + 1;
      this.sendScores();
      this.quests.naughtyBoyDown(d.c, from);
      this.invasion.naughtyBoyDown(d.c, from);
      // naughty boys sometimes drop a pint, a bottle or some rounds, and a ladder lad always leaves his ladder
      const c = this.naughtyBoys.at(d.c);
      if (c?.kind === LADDER) { this.pickups.place(c.x, c.z, "ladder", 90); this.net.send("pk", this.pickups.snapshot()); }
      else if (c && this.pickups.drop(c.x, c.z)) this.net.send("pk", this.pickups.snapshot());
    }
  }

  private applyCatHit(from: string, d: { c: number; g: number; head: boolean; w?: number; x?: number; s?: number }) {
    if (!this.entry(from).alive) return;
    const res = this.cats.damage(d.c, d.g, this.hitDamage(d));
    if (!res) return;
    const first = !this.passive && this.cats.aggro(d.c, from, this.posOf(from) ?? this.cats.at(d.c)!);
    this.broadcastEvent({ k: res === "kill" ? "kkill" : "kdmg", c: d.c, g: d.g, by: from, h: d.head, m: d.w === 0 ? 1 : 0, w: d.w, first: first ? 1 : 0 });
  }

  private applyBendyHit(from: string, d: { g: number; head: boolean; w?: number; x?: number; s?: number }) {
    if (!this.entry(from).alive) return;
    const res = this.bendy.damage(d.g, this.hitDamage(d));
    if (!res) return;
    if (!this.passive) this.bendy.aggro(from);
    this.broadcastEvent({ k: res === "kill" ? "bkill" : "bdmg", g: d.g, by: from, h: d.head, m: d.w === 0 ? 1 : 0, w: d.w });
    if (res === "kill") {
      // he leaves the best prizes behind
      const b = this.bendy.at();
      for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; this.pickups.bonus(b.x + Math.cos(a) * 1.5, b.z + Math.sin(a) * 1.5, true); }
      this.net.send("pk", this.pickups.snapshot());
    }
  }

  /** Who the naughty boys can go for, as the host sees them. */
  /** The debug panel's "Bonfire night" (debug.ts): the bonfire built (bonfire.ts) and the clock
   *  moved on to nine at night if it isn't dark yet, for everyone in the game. */
  bonfireNight() {
    const [ok, said] = this.bonfire.bonfireNight(this.net.selfId, this.isHost);
    if (ok && nightNow() < 0.6) skipHours(Math.ceil((((21 - timeOfDay() * 24) % 24) + 24) % 24));
    this.toast(said, 3);
  }

  /** Everyone else, as the bonfire and the strange objects want them. */
  private holders() {
    return [...this.remotes.values()].map((r) => ({ id: r.id, x: r.avatar.x, y: r.avatar.y, z: r.avatar.z, yaw: r.avatar.yaw, alive: r.avatar.alive }));
  }

  /** We've just picked up one of the strange objects: it takes the one carrying slot. */
  private tookOddment() {
    const had = this.held, ladder = this.ladders.carriers.has(this.net.selfId);
    if (this.riding) this.dismount(false);
    this.held = null;
    if (ladder) this.askLadder({ op: "drop" });
    if (had || ladder) this.toast(`You leave ${ladder ? "the ladder" : rideSpecs[had!].name} and take it`, 3);
    this.sendState();
  }

  /** For testing: n of the strange objects round you (the console, or ?objects=N). */
  oddmentsHere(n: number) { this.oddments.spawnNear(n, this.isHost); }
  /** For testing: where each challenge went, by zone. */
  challengeZones() { return challengesOn(this.map).map((p) => `${p.c.name} in zone ${p.zone + 1} at ${p.spots[0].name}`); }

  /** You, as the bonfire wants you (bonfire.ts). */
  private woodMe() {
    const p = this.player;
    return { id: this.net.selfId, x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, alive: this.alive };
  }

  /** The games' places for the maps: the door to the mines, the deli and the bonfire. */
  private gameSpots() {
    const named = (s: { x: number; z: number } | undefined, name?: string) => s && { x: s.x, z: s.z, name };
    // (the strange structure goes unnamed, on the map as everywhere else)
    return [named(this.mineTour.spot(), "The mine tour"), named(this.deliDoor.spot(), "The deli"), named(this.bonfire.spot(), "Get Wood"), named(this.oddments.spot())].filter((s) => !!s);
  }

  private targets(): Target[] {
    const p = this.player.pos;
    // nobody goes for you while you're at a narrowboat's tiller: you're above all that
    const helm = (id: string) => !!this.world.canal?.helmOf(id);
    const out: Target[] = [{ id: this.net.selfId, x: p.x, y: p.y, z: p.z, alive: this.alive, passive: this.passive || helm(this.net.selfId) }];
    for (const r of this.remotes.values()) out.push({ id: r.id, x: r.avatar.x, y: r.avatar.y, z: r.avatar.z, alive: r.avatar.alive, passive: this.passive || helm(r.id) });
    return out;
  }

  private applyRespawn(id: string, life: number) {
    const s = this.entry(id);
    if (life < s.life) return;
    Object.assign(s, { hp: 100, alive: true, life });
    this.sendScores();
  }

  /** Someone wants to get in a vehicle: the driver's seat if it's free, else a passenger seat (seat k if they say). */
  private applyEnter(from: string, d: { v: number; life: number; k?: number; t?: number }) {
    const s = this.entry(from);
    let v = this.vehicles.get(d?.v);
    // pulling the driver out of a car in the traffic: it becomes a vehicle
    if (!v && Number.isInteger(d?.t) && d.v === TRAFFIC_ID + d.t! && s.alive && s.life === d.life) {
      const c = this.traffic.take(d.t!);
      if (c) v = this.vehicles.spawn(d.v, c.paint, c.make, c.x, c.z, c.a);
    }
    if (!v || v.driver.startsWith("@") || v.barred.has(from)) return;
    const gone = (id: string) => id !== from && id !== this.net.selfId && !this.peers().includes(id);
    const want = Number.isInteger(d.k) && d.k! >= 0 && d.k! < v.seats.length && !v.kept.has(d.k!) && (!v.seats[d.k!] || gone(v.seats[d.k!]) || v.seats[d.k!] === from) ? d.k! : -1;
    const k = v.seats.includes(from) ? v.seats.indexOf(from) : want >= 0 ? want : v.freeSeat(gone);
    if (k >= 0 && s.alive && s.life === d.life) {
      const was = this.vehicles.of(from);
      if (was && (was.v !== v || was.seat !== k)) this.seatPerson(was.v, was.seat, "");
      this.seatPerson(v, k, from);
      v.usedAt = performance.now();
    }
    this.sendVehicles();
    this.checkMine();
  }

  /** Someone got out (of seat k). If they were driving, they've left it here. */
  private applyExit(from: string, d: { v: number; k?: number; x: number; z: number; a: number; tip: number }) {
    const v = this.vehicles.get(d?.v), k = v ? v.seats.indexOf(from) : -1;
    if (!v || k < 0) return;
    this.seatPerson(v, k, "");
    v.usedAt = performance.now();
    if (k === 0 && [d.x, d.z, d.a].every(Number.isFinite)) v.place(d.x, d.z, d.a, d.tip === 1 || d.tip === -1 ? d.tip : 0);
    this.sendVehicles();
  }

  private sendVehicles() {
    this.vhT = VH_EVERY;
    if (this.vhKnown) this.net.send("vh", this.vehicles.snapshot());
  }

  // ---- driving and riding -----------------------------------------------------------------
  private seatPerson(v: Vehicle, k: number, id: string) {
    v.sit(k, id, id === this.net.selfId ? "#e3a33b" : colourFor(id));
  }

  /** The vehicle numbers the host has listed, so a start-up vehicle it stops listing can be let go. */
  private hostHad = new Set<number>();

  /** The host's list of which vehicles there are, who's sitting where, and where everything's parked. */
  private onVehicles(d: { i?: number[]; s: string[]; p: number[]; m?: (number[] | 0)[]; k?: ([string, number] | 0)[] }) {
    if (!Array.isArray(d?.s) || !Array.isArray(d?.p) || d.p.length !== d.s.length * 4) return;
    const me = this.net.selfId, ids = Array.isArray(d.i) && d.i.length === d.s.length ? d.i : d.s.map((_, n) => n);
    ids.forEach((i, n) => {
      const seats = String(d.s[n] ?? "").split(","), [x, z, a, tip] = d.p.slice(n * 4, n * 4 + 4), m = d.m?.[n], k = d.k?.[n];
      // a parked car someone's been in, or one taken from the traffic, becomes a vehicle here too
      // (and a square's start-up vehicle, which a guest without that square can't make itself)
      const v = this.vehicles.get(i)
        ?? (Array.isArray(k) && k.length === 2 && [x, z, a].every(Number.isFinite) ? this.vehicles.spawnStarted(i, k[0] as VKind, k[1], x, z, a) : undefined)
        ?? (Array.isArray(m) && [x, z, a, ...m].every(Number.isFinite) ? this.vehicles.spawn(i, m[0], m[1], x, z, a) : undefined);
      if (!v) return;
      const mine = this.ride?.v === v ? this.ride.seat : -1;
      if (mine >= 0) {
        if (seats[mine] === me) { /* still ours */ }
        else if (!seats[mine]) this.net.send("vin", { v: i, life: this.life, k: mine }, this.hostId);   // the host lost track: say so again
        else this.getOut(false);   // someone else has the seat now
      }
      v.seats.forEach((had, k) => {
        if (k === mine && this.ride?.v === v) return;
        const id = seats[k] ?? "";
        if (id === me && !(this.askedCar === i && this.ride?.v !== v)) { this.net.send("vout", { v: i, k, x: v.x, z: v.z, a: v.a, tip: v.tip }, this.hostId); return; }
        if (id !== had) this.seatPerson(v, k, id);
      });
      const far = Math.hypot(v.x - x, v.z - z) > 0.05 || Math.abs(Math.atan2(Math.sin(v.a - a), Math.cos(v.a - a))) > 0.02;
      // (not while it's sliding, knocked: the host's moving it, a frame at a time)
      if (!v.driver && !v.coast && performance.now() - v.heard > 1000 && [x, z, a].every(Number.isFinite) && (far || v.tip !== tip)) v.place(x, z, a, tip === 1 || tip === -1 ? tip : 0);
    });
    // The host's list is the whole of it, so a start-up vehicle it had and no longer has went with
    // its square (the host takes a square's waiting buses away) and ours goes too, or it would
    // stand there for ever. Only one the host has listed before: a square we have and it hasn't may
    // have given us buses it never knew of, and those aren't its to take away.
    const here = new Set(ids);
    for (const i of ids) this.hostHad.add(i);
    for (const v of [...this.vehicles.list]) {
      if (here.has(v.i) || !this.hostHad.has(v.i) || !isStartup(v.i) || v.seats.some(Boolean) || this.ride?.v === v) continue;
      this.vehicles.remove(v);
    }
    this.vhKnown = true;
    this.checkMine();
  }

  /** Get in once the host says we've a seat in the vehicle we asked for. */
  private checkMine() {
    if (this.askedCar < 0 || this.ride) return;
    const v = this.vehicles.get(this.askedCar), k = v ? v.seats.indexOf(this.net.selfId) : -1;
    if (v && k >= 0) this.getIn(v, k);
    else if (v && v.freeSeat() < 0) { this.askedCar = -1; this.toast(`The ${v.name}'s full`, 2); }
  }

  /** E: get in the vehicle you're next to, or out of the one you're in. */
  /** X with a ladder (the key for whatever you're carrying): put it up against the wall you're facing. */
  private putLadder() {
    const p = this.player;
    if (!this.alive || this.car || this.ride || this.basket || p.ladder || !p.onGround || performance.now() - this.ladderAsked < 800) return;
    const at = this.ladders.aim(p.pos.x, p.pos.y, p.pos.z, p.yaw);
    if (typeof at === "string") { this.rideTip = performance.now() + TIP_MS; this.toast(at, 2); return; }
    this.askLadder({ op: "up", r: at });
  }

  /** E at the foot of a ladder or on the roof over its top: take it down to carry. Returns true if E was for that. */
  private useLadder(): boolean {
    const p = this.player, me = this.net.selfId;
    if (!this.alive || this.riding || this.basket || p.ladder || performance.now() - this.ladderAsked < 800) return false;
    if (this.ladders.carriers.has(me)) return false;
    const L = this.ladders.footAt(p.pos.x, p.pos.y, p.pos.z) ?? this.ladders.topAt(p.pos.x, p.pos.y, p.pos.z);
    if (!L) return false;
    this.askLadder({ op: "down", i: L.id, drop: this.held ?? undefined });
    return true;
  }

  private askLadder(d: { op: string; r?: unknown; i?: number; drop?: RideKind }) {
    this.ladderAsked = performance.now();
    if (this.isHost) this.applyLadder(this.net.selfId, d);
    else this.net.send("ldr", d, this.hostId);
  }

  /** Host: someone puts their ladder up, or takes one down. */
  private applyLadder(from: string, d: { op?: string; r?: any; i?: number; drop?: RideKind }) {
    if (!this.entry(from).alive) return;
    const at = this.posOf(from);
    if (d?.op === "drop") {
      // they've taken a ride instead: their ladder stays where they are
      if (this.ladders.drop(from)) {
        if (at) { this.pickups.place(at.x, at.z, "ladder", LEFT_LIFE); this.net.send("pk", this.pickups.snapshot()); }
        this.sendLadders();
      }
      return;
    }
    if (d?.op === "up" && d.r && this.ladders.put(from, d.r)) {
      if (from === this.net.selfId) SFX.ladderUp();
      this.sendLadders();
    } else if (d?.op === "down" && typeof d.i === "number" && this.ladders.take(from, d.i)) {
      if (from === this.net.selfId) { SFX.pickup("ladder"); this.tookLadder(); }
      if (d.drop && isRide(d.drop) && at) { this.pickups.place(at.x, at.z, d.drop, LEFT_LIFE); this.net.send("pk", this.pickups.snapshot()); }
      this.sendLadders();
    }
  }

  /** We've just got a ladder: it takes the one carrying slot, so any ride we had is left here. Returns true if it said so. */
  private tookLadder(): boolean {
    if (this.oddments.carrying(this.net.selfId)) { this.oddments.drop(this.woodMe(), this.isHost); this.toast("You put it down and take the ladder", 3); return true; }
    if (!this.held) return false;
    const had = this.held;
    if (this.riding) this.dismount(false);
    this.held = null;
    this.toast(`You leave ${rideSpecs[had].name} and take the ladder`, 3);
    this.sendState();
    return true;
  }

  private sendLadders() {
    this.ldT = PK_EVERY;
    this.net.send("lds", this.ladders.snapshot());
  }

  /** Take the train to another town (railway.ts): hand main.ts what must come with us and let it
   *  rebuild the Game on the new map. Only ever called from a station platform, stepping off train.
   *  Returns false if we're not in a state to travel (so the caller can say why). */
  travelTo(toMap: string, at: { x: number; z: number; yaw: number }, journeySecs = 0): boolean {
    if (!this.onTravel) return false;
    if (!this.alive) { this.toast("Wait till you're back on your feet", 2.5); return false; }
    if (toMap === this.mapId) return false;
    this.onTravel(toMap, {
      born: this.born, since: [...this.since], scores: this.scores,
      hp: this.hp, life: this.life, alive: this.alive,
      at, cameFrom: this.mapId, voice: this.voice,
      arriveAt: this.pendingArrival, skip: getSkip(), journeySecs,
    });
    return true;
  }

  private useVehicle() {
    if (this.ride) { this.getOut(); return; }
    if (this.riding && this.nearCar()) this.dismount();
    if (!this.alive || this.sports.lining || this.broadcast.on) return;
    const v = this.nearCar();
    if (!v) {
      // at a bus stop: up comes the menu (E again puts it away)
      const stop = this.stopNear();
      if (stop && !this.zones.can("bus")) { this.toast(this.zones.shut("bus"), 2.5); return; }
      if (stop && this.busMenu <= performance.now()) { this.busMenu = performance.now() + 8000; this.busStop = stop; }
      else this.busMenu = 0;
      return;
    }
    if (v.t === undefined && !this.vehicles.get(v.i)) return;
    this.askedCar = v.i;
    this.askedAt = performance.now();
    this.nicking = v.t !== undefined;
    const claim = { v: v.i, life: this.life, t: v.t };
    if (this.isHost) this.applyEnter(this.net.selfId, claim);
    else this.net.send("vin", claim, this.hostId);
  }

  /** Through the front door of 1 The Firs and down into the mines, with the same party. */
  private goDownMine() {
    const url = new URL("mines.html", location.href);
    url.searchParams.set("go", "1");
    if (this.room !== "SOLO") url.searchParams.set("room", this.room);
    url.searchParams.set("map", this.mapId);
    if (this.net.kind === "local") url.searchParams.set("net", "local");
    this.toast("Mind your head on the way down", 2);
    setTimeout(() => { this.dispose(); location.href = url.toString(); }, 400);
  }

  /** Through the Darling Deli's front door and into the kitchen, with the same party (deli/). */
  private goInDeli() {
    const url = new URL("deli.html", location.href);
    url.searchParams.set("go", "1");
    if (this.room !== "SOLO") url.searchParams.set("room", this.room);
    url.searchParams.set("map", this.mapId);
    if (this.net.kind === "local") url.searchParams.set("net", "local");
    this.toast("Pinny on, hands washed", 2);
    setTimeout(() => { this.dispose(); location.href = url.toString(); }, 400);
  }

  /** A vehicle near enough to get in, with a seat free: one of ours, a parked car, or one in the traffic. */
  private nearCar(): { i: number; name: string; driver: string; t?: number } | null {
    const p = this.player.pos;
    const v = this.vehicles.nearest(p.x, p.z, p.y, CAR_REACH);
    if (v) return v;
    const c = this.traffic.nearest(p.x, p.z, p.y, CAR_REACH);
    return c && { i: TRAFFIC_ID + c.n, name: c.name, driver: "", t: c.n };
  }

  private getIn(v: Vehicle, seat: number) {
    this.askedCar = -1;
    this.ride = { v, seat };
    const p = this.player;
    if (seat === 0) {
      if (this.nicking) this.toast(`You drag the driver out of the ${v.name}`, 3);
      else if (v.tip) { v.right(); this.toast(`You heave the ${v.name} back onto its wheels`, 2.5); }
      else this.toast(CAR_LINE[v.kind] ?? v.name, 3);
      this.aiming = this.binoculars = this.firing = false;
      p.pitch = -0.15;
    } else {
      this.toast(v.kind === "bus" && v.spec.seats[seat][1] > 2 ? "Top deck, front seats. Shoot out of the windows" : `In the ${v.name}. You can shoot from here`, 2.5);
      p.pitch = 0;
    }
    p.crouchLatch = p.proneLatch = false;
    p.yaw = v.seat(seat).yaw;
    this.vsT = 0;
    SFX.door();
  }

  /** Out of your door (or wherever's clear). The driver leaves it where it stopped. tell: let the host know. */
  private getOut(tell = true) {
    const ride = this.ride;
    if (!ride) return;
    const { v, seat } = ride;
    this.ride = null;
    this.handbrake = false;
    this.insideOf?.inside(false);
    this.insideOf = null;
    this.insideYaw = null;
    const at = v.exitSpot(seat), p = this.player;
    p.spawn(at.x, at.z, p.yaw);
    p.pos.y = this.map.floor(at.x, at.z, v.y + 0.5);
    if (seat === 0) { v.siren = false; v.place(v.x, v.z, v.a, v.tip); }
    this.seatPerson(v, seat, "");
    SFX.door();
    const q = (n: number) => Math.round(n * 100) / 100;
    if (this.isHost) { v.usedAt = performance.now(); this.sendVehicles(); }
    else if (tell) this.net.send("vout", { v: v.i, k: seat, x: q(v.x), z: q(v.z), a: q(v.a), tip: v.tip }, this.hostId);
  }

  /** Drive, sit in the driver's seat, and put the camera behind. */
  private driveCar(dt: number, v: Vehicle) {
    const p = this.player, k = p.keys, on = this.active && this.alive;
    const key = (a: string, b: string) => (on && (k.has(a) || k.has(b)) ? 1 : 0);
    // (the left and right arrows are the indicators, see the keys above, and the up arrow the horn)
    let throttle = key("KeyW", "KeyW") - key("KeyS", "ArrowDown"), steer = key("KeyA", "KeyA") - key("KeyD", "KeyD");
    if (on && !throttle && !steer && Math.hypot(p.joy.x, p.joy.y) > 0.15) { throttle = -p.joy.y; steer = -stickSteer(p.joy.x); }
    const handbrake = on && (k.has("Space") || this.handbrake), horn = on && (k.has("KeyH") || k.has("ArrowUp") || this.firing);
    // the police car's siren and the ice cream van's chimes: H (or the up arrow) switches them on and off
    if (v.spec.siren && horn && !this.hornWas) {
      v.siren = !v.siren;
      if (v.siren && v.kind === "icecream") this.toast("Greensleeves: everyone can hear you coming", 2);
    }
    this.hornWas = horn;
    // the indicators' relay ticking behind the dash
    const blink = performance.now() % 760 < 380;
    if (v.signal && blink !== this.blinkWas) SFX.relay(blink);
    this.blinkWas = blink;
    v.drive(dt, { throttle, steer, handbrake, horn: horn && !v.spec.siren }, (x, z) => this.world.paved(x, z), this.shoving(v, this.net.selfId));
    v.pose(dt, performance.now());
    if (v.impact > 3) SFX.crash(Math.min(1, (v.impact - 3) / 12));
    if (v.spec.milk && v.impact > 3.5) this.smashMilk(v);
    if (v.flipped) { SFX.crash(0.7); this.toast("Over she goes. {out} to get out", 3); }
    if (Math.abs(v.speed) > (v.spec.crush ? 0.6 : 4)) this.runOver(v);
    // in the driver's seat
    const s = v.seat();
    p.pos.set(s.x, s.y, s.z);
    p.vel.set(v.vx, 0, v.vz);
    p.onGround = true;
    p.speed = Math.abs(v.speed);
    if (this.insideOf !== (this.inside ? v : null)) { this.insideOf?.inside(false); this.insideOf = this.inside ? v : null; this.insideOf?.inside(true); }
    const settle = settleRate(performance.now() - p.lookedAt, Math.abs(v.speed) > 2, throttle > 0, dt);
    if (this.inside) { this.driverView(v, s.yaw, settle); return; }
    this.insideYaw = null;
    // the chase camera: the mouse only looks about, and it swings back behind as you drive on
    if (settle) {
      p.yaw += Math.atan2(Math.sin(s.yaw - p.yaw), Math.cos(s.yaw - p.yaw)) * settle;
      p.pitch += (-0.2 - p.pitch) * settle;
    }
    p.pitch = Math.max(-0.75, Math.min(0.3, p.pitch));
    const cp = Math.cos(p.pitch);
    const back = new THREE.Vector3(Math.sin(p.yaw) * cp, -Math.sin(p.pitch), Math.cos(p.yaw) * cp);
    // it hangs a little above the roof and a bit further back than the vehicle's own reach, so you see the road ahead over it
    const reach = v.spec.cam * 1.25;
    const target = new THREE.Vector3(v.x, v.y + v.spec.H * 0.8 + 1.1, v.z);
    const hit = this.map.raycast(target.x, target.y, target.z, back.x, back.y, back.z, reach);
    const cam = target.addScaledVector(back, hit ? Math.max(1.5, hit.dist - 0.3) : reach);
    cam.y = Math.max(cam.y, this.map.floor(cam.x, cam.z, v.y + 1) + 0.6);
    this.camera.position.copy(cam);
    this.camera.rotation.set(p.pitch, p.yaw, 0, "YXZ");
  }

  /**
   * The driver's own view, from their seat over the dash (cockpit.ts). It turns with the vehicle; look
   * about with the mouse, and it eases back to straight ahead as the chase camera does. It pitches with the
   * vehicle on a hill but leans only a little with it in a corner, so the road doesn't lurch about.
   */
  private driverView(v: Vehicle, ahead: number, settle: number) {
    const p = this.player;
    if (this.insideYaw !== null) p.yaw += Math.atan2(Math.sin(ahead - this.insideYaw), Math.cos(ahead - this.insideYaw));
    this.insideYaw = ahead;
    let off = Math.atan2(Math.sin(p.yaw - ahead), Math.cos(p.yaw - ahead));
    if (settle) {
      off -= off * settle;
      p.pitch += (-0.06 - p.pitch) * settle;
    }
    off = Math.max(-2.4, Math.min(2.4, off));
    p.yaw = ahead + off;
    p.pitch = Math.max(-0.8, Math.min(0.5, p.pitch));
    const tilt = v.eyes(this.camera.position);
    this.camera.rotation.set(p.pitch + tilt.pitch * Math.cos(off), p.yaw, -tilt.roll * 0.3, "YXZ");
  }

  /** A passenger: sat in your seat as it goes along, looking about through your own eyes (and free to shoot). */
  private rideAlong(seat: number, v: Vehicle) {
    if (this.insideOf) { this.insideOf.inside(false); this.insideOf = null; }   // the driver's view is only from the driver's seat
    const p = this.player, s = v.seat(seat);
    p.pos.set(s.x, s.y, s.z);
    p.vel.set(v.vx, 0, v.vz);
    p.onGround = true;
    p.speed = 0;
    p.crouch = 1;   // sat down: eyes at a seated height
    p.applyToCamera(this.camera);
  }

  /** What vehicle v ploughs through: the traffic, the cars parked round it and any vehicle nobody's in. by: who's to blame. */
  private shoving(v: Vehicle, by: string): Shove {
    const near = (o: { x: number; z: number }) => Math.abs(o.x - v.x) < v.hl + 6 && Math.abs(o.z - v.z) < v.hl + 6;
    const list: Loose[] = [...this.traffic.list];
    for (const o of this.vehicles.list) if (o !== v && !o.driver && near(o)) list.push(o);
    for (const p of this.vehicles.parkedNear(v.x, v.z, v.hl + 5))
      list.push({ n: p.i, kerb: p.i, x: p.x, z: p.z, a: p.a, hl: 2.05, hw: 0.88, y: p.g, top: p.g + 1.45, waist: p.g + 0.98, vx: 0, vz: 0, mass: CAR_MASS });
    return {
      list,
      hit: (o, dvx, dvz, spin) => {
        if (o.kerb !== undefined) this.knockParked(o.kerb, dvx, dvz, spin, by);
        else if (o instanceof Vehicle) this.knockVehicle(o, dvx, dvz, spin, by);
        else this.shoveCar(o.n, dvx, dvz, spin, by);
      },
    };
  }

  /** A car in the traffic's been driven into: knock it (the host runs it; anyone else sees it go straight away and tells the host). */
  private shoveCar(n: number, dvx: number, dvz: number, spin: number, by: string) {
    if (this.isHost) { this.traffic.shove(n, dvx, dvz, spin, by); return; }
    const q = (v: number) => Math.round(v * 100) / 100;
    this.traffic.nudge(n, dvx, dvz, spin);
    this.net.send("tfx", [n, q(dvx), q(dvz), q(spin)], this.hostId);
  }

  /** A car parked in the street's been driven into (i: its vehicle number): hard enough, it comes out of the street furniture as a wreck in the traffic. */
  private knockParked(i: number, dvx: number, dvz: number, spin: number, by: string) {
    if (![i, dvx, dvz, spin].every(Number.isFinite) || Math.hypot(dvx, dvz) < KNOCK) return;
    const at = this.vehicles.unpark(i);
    if (!at) return;
    if (this.isHost) { this.traffic.unparked(i, at, dvx, dvz, spin, by); return; }
    const q = (v: number) => Math.round(v * 100) / 100;
    this.traffic.unparkedHere(i, at, dvx, dvz, spin);
    this.net.send("tfp", [i, q(dvx), q(dvz), q(spin)], this.hostId);
  }

  /** A vehicle nobody's in has been driven into: it slides off, handbrake on (the host runs it; anyone else guesses till the host's word comes). */
  private knockVehicle(v: Vehicle, dvx: number, dvz: number, spin: number, by: string) {
    if (v.driver || ![dvx, dvz, spin].every(Number.isFinite) || Math.hypot(dvx, dvz) < 1) return;
    const dv = Math.hypot(dvx, dvz), k = dv > 30 ? 30 / dv : 1;
    v.knock(dvx * k, dvz * k, Math.max(-4, Math.min(4, spin)), by);
    if (this.isHost) return;
    const q = (x: number) => Math.round(x * 100) / 100;
    this.net.send("vk", [v.i, q(dvx), q(dvz), q(spin)], this.hostId);
  }

  /** A car in the traffic goes up at (x, y, z): the fireball and the bang, a flash that lights up the
   *  street round it, the camera jolts, and a car you're driving gets shoved. */
  private carGoesUp(x: number, y: number, z: number) {
    this.effects.explosion(new THREE.Vector3(x, y, z));
    this.flash.go(x, y + 2.5, z, "#ff9a45", 250, { fade: 1.3, reach: 70, twinkle: true });
    SFX.boom(...this.hear(x, y, z));
    const cam = this.camera.position, d = Math.hypot(cam.x - x, cam.y - y, cam.z - z);
    if (d < 40) this.player.pitch += 0.08 * (1 - d / 40);
    const v = this.car;
    if (v) {
      const dx = v.x - x, dz = v.z - z, r = Math.hypot(dx, dz);
      if (r < 10 && r > 0.01) { const k = (8 * (1 - r / 10)) / Math.max(1, v.spec.mass); v.vx += (dx / r) * k; v.vz += (dz / r) * k; }
    }
  }

  /** Host: a car in the traffic's gone up. Naughty boys, the posh teams and Bendy caught in it are hurt (not players, and not the cats), by whoever knocked it over. */
  private caughtIn(x: number, y: number, z: number, by: string) {
    if (by !== this.net.selfId && !this.remotes.has(by)) return;   // they've gone
    const hurt = (cx: number, cy: number, cz: number) => {
      const d = Math.hypot(cx - x, cy + 0.9 - y, cz - z);
      return d < BLAST_R ? Math.round(BLAST_HIT * (1 - d / BLAST_R)) : 0;
    };
    for (const c of this.naughtyBoys.living()) {
      const g = this.naughtyBoys.at(c.i)?.gen, s = hurt(c.x, c.y, c.z);
      if (g !== undefined && s > 0) this.applyNaughtyBoyHit(by, { c: c.i, g, head: false, w: BLAST, s, fx: x, fz: z });
    }
    const b = this.bendy.living();
    if (b) {
      const s = hurt(b.x, b.y, b.z);
      if (s > 0) this.applyBendyHit(by, { g: b.gen, head: false, w: BLAST, s });
    }
  }

  /** The milk float's crates go over: bottles everywhere. */
  private smashMilk(v: Vehicle) {
    const now = performance.now();
    if (now - this.milkT < 1500) return;
    this.milkT = now;
    SFX.bottles();
    const c = Math.cos(v.a), s = Math.sin(v.a);
    for (let k = 0; k < 5; k++) {
      const along = -1.5 + Math.random() * 2;
      this.effects.impact(new THREE.Vector3(v.x + along * c, v.y + 1.1, v.z - along * s), new THREE.Vector3(0, 1, 0), "#f4f4ee", 10);
    }
    this.toast("Mind the milk", 1.5);
  }

  /** Anyone in front of a moving vehicle goes under it: claim them like a shot. */
  private runOver(v: Vehicle) {
    const now = performance.now(), s = Math.round(Math.max(Math.abs(v.speed), v.spec.crush ? 4 : 0) * v.spec.mass * 10) / 10;
    const fresh = (key: string) => {
      if (now - (this.runT.get(key) ?? -1e9) < 1500) return false;
      this.runT.set(key, now);
      return true;
    };
    for (const c of this.naughtyBoys.living()) {
      const g = this.naughtyBoys.at(c.i)?.gen;
      if (g === undefined || v.distance(c.x, c.z) > 0.5 || Math.abs(c.y - v.y) > 2 || !fresh(c.key)) continue;
      this.thud(v);
      const claim = { c: c.i, g, head: false, w: RUN, s, a: Math.round(v.a * 100) / 100 };
      if (this.isHost) this.applyNaughtyBoyHit(this.net.selfId, claim);
      else this.net.send("chit", claim, this.hostId);
    }
    const b = this.bendy.living();
    if (b && v.distance(b.x, b.z) < 0.5 && Math.abs(b.y - v.y) < 2 && fresh(b.key)) {
      this.thud(v);
      const claim = { g: b.gen, head: false, w: RUN, s };
      if (this.isHost) this.applyBendyHit(this.net.selfId, claim);
      else this.net.send("bhit", claim, this.hostId);
    }
    for (const c of this.cats.living()) {
      const g = this.cats.at(c.i)?.gen;
      if (g === undefined || v.distance(c.x, c.z) > 0.5 || Math.abs(c.y - v.y) > 2 || !fresh(c.key)) continue;
      const claim = { c: c.i, g, head: false, w: RUN, s };
      if (this.isHost) this.applyCatHit(this.net.selfId, claim);
      else this.net.send("khit", claim, this.hostId);
    }
    for (const r of this.remotes.values()) {
      const a = r.avatar;
      if (!a.alive || a.seated || v.distance(a.x, a.z) > 0.5 || Math.abs(a.y - v.y) > 2 || !fresh(`${r.id}.${r.life}`)) continue;
      this.thud(v);
      const claim = { t: r.id, head: false, life: r.life, w: RUN, s };
      this.traded(r.id);
      if (this.isMatchHost) this.applyHit(this.net.selfId, claim);
      else this.net.send("hit", claim, this.matchHostId);
    }
  }

  private thud(v: Vehicle) {
    SFX.crash(0.25);
    SFX.impact("body", 0, 0, true);
    if (!v.spec.crush) v.slow(0.85);
    this.hitT = 0.18;
    $("hitmarker").classList.remove("head");
  }

  // ---- the canal and the railways ----------------------------------------------------------
    /** The door you're at, if any: the one way onto a train (railway.ts's doorAt). Null when you're
     *  not at an open doorway, which is also how E does nothing when you press it elsewhere. */
    private atTrainDoor(): Route | null {
      const rail = this.world.railway, p = this.player.pos;
      if (!rail || !this.alive || this.car || this.ride) return null;
      return rail.doorAt(p.x, p.z, p.y, 0.35);
    }

    /** Board the train whose door you're at, and take it to the town at the far end of its linked
     *  route (railway.ts). Says why not, and returns false, if that train goes nowhere from here. */
    private trainUse(through?: Route): boolean {
      const rail = this.world.railway;
      if (!rail || !this.alive || this.car || this.ride) return false;
      const route = through ?? this.atTrainDoor();
      if (!route) return false;
      const link = rail.linkFor(route);
      if (!link) { this.toast(route.to ? `This train's bound for ${route.to}, and you can't go there yet.` : "This train isn't going anywhere yet.", 2.5); return false; }
      this.blackout(`${link.station} to ${link.to_station}`);
      // the arrival platform is on the other map, so it's found once that map has loaded (main.ts's
      // travel asks the new world for it): here we only say where we're going
      this.pendingArrival = link.to_station;
      if (!this.travelTo(link.to, { x: this.player.pos.x, z: this.player.pos.z, yaw: this.player.yaw }, link.secs)) {
        this.pendingArrival = undefined;
        $("blackout").hidden = true;
      }
      return true;
    }

  /** What the departure board says for the platform you're standing on (railway.ts): its next
   *  train you can get on (or the station's, from another platform), where it's bound, the town it
   *  takes you on to, and how soon. "" when you're not on a platform. */
  private platformHint(): string {
    const rail = this.world.railway, p = this.player.pos;
    const on = rail?.platformAt(p.x, p.z, p.y);
    if (!rail || !on) return "";
    const all = rail.departures(on.station, 8).filter((d) => d.service), mine = all.find((d) => !on.no || d.plat === on.no);
    const d = mine ?? all[0];
    if (!d) return `${esc(on.station)}${on.no ? ` · Platform ${esc(on.no)}` : ""}`;
    if (rail.shutAt(p.x, p.z)) return `${esc(on.station)} · ${esc(this.zones.shut("train"))}`;
    const hm = clockAt(d.at);
    const where = d.plat && d.plat !== on.no ? ` from platform ${esc(d.plat)}` : "";
    const town = d.on && d.on !== d.to ? `, for ${esc(d.on)}` : "";
    return `${on.no ? `Platform ${esc(on.no)}` : esc(on.station)} · next train ${hm} to ${esc(d.to)}${town}${where} · ${esc(d.status === "Boarding" ? "boarding now" : d.status === "Due" ? "due now" : `in ${d.status}`)}`;
  }

  /** A black screen over the game while we change maps (the loading, and the journey). main.ts's
   *  travel keeps it up until the new world is ready. */
  private blackout(text: string) {
    $("blackout").hidden = false;
    $("blackouttext").textContent = text;
  }

  /** E by the canal: let go of the tiller you're at, take one within reach, or work a lock. True if it did. */
  private canalUse(): boolean {
    const canal = this.world.canal, p = this.player.pos, me = this.net.selfId;
    if (!canal || !this.alive) return false;
    if (canal.helmOf(me)) { this.letGo(); return true; }
    if (this.nearCar()) return false;
    // (or one moored by the bank: cast off, it's a boat under way like any other)
    const moored = canal.tillerNear(p.x, p.y, p.z, me) ? -1 : canal.mooredNear(p.x, p.y, p.z);
    if ((moored >= 0 || canal.tillerNear(p.x, p.y, p.z, me)) && !this.zones.can("boat")) { this.toast(this.zones.shut("boat"), 2.5); return true; }
    const b = moored >= 0 ? canal.castOff(moored) : canal.tillerNear(p.x, p.y, p.z, me);
    if (b) {
      if (this.isHost) canal.take(b.n, me);
      else { b.helm = me; this.net.send("cnu", { k: "take", b: b.n }, this.hostId); }
      this.throttle = 0; this.tiller = 0;
      this.toast(`You take the tiller of ${b.name}. {throttle} throttle, {steer} tiller, {view} for the view, {out} to let go`, 3.5);
      SFX.door();
      return true;
    }
    const i = canal.lockNear(p.x, p.z);
    if (i < 0) return false;
    const lk = canal.locks[i], filling = lk.want === 0;
    if (this.isHost) canal.work(i);
    else { lk.want = filling ? 1 : 0; this.net.send("cnu", { k: "lock", i }, this.hostId); }
    this.toast(`You lean on the beam. ${lk.d.n} ${filling ? "fills" : "empties"} and the gates at the ${filling ? "top" : "bottom"} open`, 3);
    SFX.grind(0, 0, 0.7);
    return true;
  }

  /** Let go of the tiller you're at (if you are), and step up onto the boat's roof. */
  private letGo() {
    const canal = this.world.canal, me = this.net.selfId;
    this.helmWas = null;
    const b = canal?.helmOf(me);
    if (!canal || !b) return;
    if (this.isHost) canal.leave(b.n, me);
    else { b.helm = ""; this.net.send("cnu", { k: "leave", b: b.n }, this.hostId); }
    const t = canal.stern(b), c = Math.cos(b.a), sn = Math.sin(b.a);
    this.player.pos.set(t.x + c * 1.2, b.top, t.z - sn * 1.2);
    this.player.vel.set(0, 0, 0);
  }

  /** At a boat's tiller: W and S work the throttle (it stays where you leave it), A and D put the tiller over (it comes back when you let go). */
  private atTiller(dt: number, b: NonNullable<ReturnType<NonNullable<World["canal"]>["helmOf"]>>) {
    const canal = this.world.canal!, p = this.player, k = p.keys, on = this.active && this.alive;
    const key = (c: string) => (on && k.has(c) ? 1 : 0);
    let push = key("KeyW") - key("KeyS"), side = key("KeyA") - key("KeyD");
    // the arrows wave (left and right) and ring the bell (up), as they indicate and sound the horn in a car
    this.wave = on ? key("ArrowLeft") | key("ArrowRight") << 1 | this.waveHeld : 0;
    const ring = on && (k.has("KeyH") || k.has("ArrowUp") || this.firing);
    if (ring && !this.bellWas) {
      const t = canal.stern(b);
      SFX.boatBell(...this.hear(t.x, t.y + 1.5, t.z));
      this.net.send("bel", 1);
    }
    this.bellWas = ring;
    if (on && !push && !side && Math.hypot(p.joy.x, p.joy.y) > 0.15) { push = -p.joy.y; side = -p.joy.x; }
    this.throttle = Math.max(-1, Math.min(1, this.throttle + push * dt * 0.8));
    if (!push && Math.abs(this.throttle) < 0.08) this.throttle = 0;
    this.tiller += (side - this.tiller) * Math.min(1, dt * 3);
    if (!side && Math.abs(this.tiller) < 0.03) this.tiller = 0;
    if (this.isHost) canal.steer(b.n, this.net.selfId, this.throttle, this.tiller);
    else if ((this.helmT -= dt) <= 0) {
      this.helmT = 0.2;
      this.net.send("cnu", { k: "st", b: b.n, t: Math.round(this.throttle * 100) / 100, w: Math.round(this.tiller * 100) / 100 }, this.hostId);
    }
    // (stood at the tiller once the boat's moved on this frame: waterways)
  }

  /**
   * Stood at the tiller, and the view: from the back deck, it turns with the boat as a car's
   * driver's seat does (look about with the mouse, and it eases back to straight ahead); or the
   * chase camera, higher and further back than a car's, to see the boat's whole length and the
   * cut ahead over it.
   */
  private standAtTiller(b: NonNullable<ReturnType<NonNullable<World["canal"]>["helmOf"]>>, dt: number) {
    const p = this.player, t = this.world.canal!.stern(b);
    p.pos.set(t.x, t.y, t.z);
    p.vel.set(0, 0, 0);
    p.onGround = true;
    p.speed = 0;
    // under a low bridge the steerer ducks, as steerers do (the arch is a metre or so under the deck)
    const over = this.map.overhead(t.x, t.z, t.y + 0.5), duck = over !== null && over - LOW_BRIDGE < t.y + 2 ? 1 : 0;
    p.crouch += (duck - p.crouch) * Math.min(1, dt * 10);
    // the view turns as the boat does
    const ahead = t.yaw;
    if (this.boatYaw !== null) p.yaw += Math.atan2(Math.sin(ahead - this.boatYaw), Math.cos(ahead - this.boatYaw));
    this.boatYaw = ahead;
    const settle = settleRate(performance.now() - p.lookedAt, Math.abs(b.v) > 0.3, this.throttle > 0, dt);
    let off = Math.atan2(Math.sin(p.yaw - ahead), Math.cos(p.yaw - ahead));
    if (settle) { off -= off * settle; p.pitch += ((this.boatChase ? -0.3 : -0.08) - p.pitch) * settle; }
    p.yaw = ahead + off;
    if (!this.boatChase) {
      p.pitch = Math.max(-0.8, Math.min(0.5, p.pitch));
      p.applyToCamera(this.camera);
      return;
    }
    p.pitch = Math.max(-0.9, Math.min(0.2, p.pitch));
    const cp = Math.cos(p.pitch);
    const back = new THREE.Vector3(Math.sin(p.yaw) * cp, -Math.sin(p.pitch), Math.cos(p.yaw) * cp);
    const target = new THREE.Vector3(b.x, b.top + 2.2, b.z), reach = b.hl * 2 + 6;
    const hit = this.map.raycast(target.x, target.y, target.z, back.x, back.y, back.z, reach);
    const cam = target.addScaledVector(back, hit ? Math.max(2, hit.dist - 0.3) : reach);
    cam.y = Math.max(cam.y, this.map.floor(cam.x, cam.z, b.y + 1) + 0.8);
    this.camera.position.copy(cam);
    this.camera.rotation.set(p.pitch, p.yaw, 0, "YXZ");
  }

  /**
   * Whoever's at a tiller, stood on the back deck as the boat goes (drawn where the boat is now,
   * not where their last message had them, and with their feet planted); and, from the chase
   * camera, you too.
   */
  private drawSteerers(dt: number, helm: ReturnType<NonNullable<World["canal"]>["helmOf"]> | null) {
    const canal = this.world.canal!;
    for (const r of this.remotes.values()) {
      const b = canal.helmOf(r.id);
      r.avatar.still = !!b;
      if (b) { const t = canal.stern(b); r.avatar.pin(t.x, t.y, t.z); }
    }
    const show = !!helm && this.boatChase && this.alive;
    if (show && !this.steerer) {
      this.steerer = new Avatar(this.name, colourFor(this.net.selfId), this.net.selfId);
      this.steerer.tagged = false;
      this.steerer.still = true;
      this.steerer.setWear(myWear());
      this.world.scene.add(this.steerer.root);
    }
    const me = this.steerer;
    if (!me) return;
    me.root.visible = show;
    if (!show) return;
    const t = canal.stern(helm!), p = this.player;
    me.wave = this.wave;
    me.holdAt(t.x, t.y, t.z, t.yaw, -0.08, p.crouch);
    me.update(performance.now(), dt);
  }

  /** Host: someone working a lock, at a tiller, or letting go of one. */
  private applyCanal(from: string, d: { k: string; i?: number; b?: number; t?: number; w?: number }) {
    const canal = this.world.canal;
    if (!canal || !d) return;
    if (d.k === "lock" && Number.isInteger(d.i)) canal.work(d.i!);
    else if (d.k === "take") canal.take(d.b!, from);
    else if (d.k === "leave") canal.leave(d.b!, from);
    else if (d.k === "st") canal.steer(d.b!, from, d.t!, d.w!);
  }

  /** Host: someone came off their ride into a wall (they say so, and how hard). */
  private applyCrash(from: string, d: { life: number; dmg: number }) {
    if (!d || !Number.isFinite(d.life) || !Number.isFinite(d.dmg)) return;
    this.catchUpLife(from, d.life);
    this.hurt(from, Math.max(1, Math.min(80, Math.round(d.dmg))), "crash", false, d.life, RUN);
  }

  // ---- rides (rides.ts) ----------------------------------------------------------------------

  /** Have a ride: swap whatever you had for it. */
  giveRide(kind: RideKind) {
    const had = this.held, ladder = this.ladders.carriers.has(this.net.selfId);
    if (this.oddments.carrying(this.net.selfId)) this.oddments.drop(this.woodMe(), this.isHost);
    if (this.riding) this.dismount(false);
    this.held = kind;
    // you carry one thing, a ride or a ladder: the one you had stays here
    if (ladder) this.askLadder({ op: "drop" });
    this.toast(ladder ? `You leave the ladder and take ${rideSpecs[kind].name}` : had && had !== kind ? `You leave ${rideSpecs[had].name} and take ${rideSpecs[kind].name}` : rideSpecs[kind].line, 3);
  }

  /** X: use what you're carrying: on or off your ride, or your ladder up against the wall you're facing. */
  toggleRide() {
    if (this.riding) { this.dismount(); return; }
    if (!this.held && this.ladders.carriers.has(this.net.selfId)) { this.putLadder(); return; }
    if (!this.held && this.oddments.carrying(this.net.selfId)) { if (this.alive && !this.car && !this.ride) this.oddments.drop(this.woodMe(), this.isHost); return; }
    if (!this.held) { this.toast("You've nothing to use. Rides and ladders turn up round the streets (trolleys outside the shops)", 3); return; }
    if (!this.alive || this.car || this.ride || this.basket || this.sports.lining || this.world.canal?.helmOf(this.net.selfId)) return;
    this.riding = true;
    this.rideTip = performance.now() + TIP_MS;
    this.player.mount(rideSpecs[this.held]);
    this.aiming = this.binoculars = false;
    this.sendState();
  }

  /** Off your ride, keeping it with you. */
  private dismount(tell = true) {
    if (!this.riding) return;
    this.riding = false;
    this.player.mount(null);
    if (tell) this.sendState();
  }

  // ---- hot air balloons (balloons.ts) ---------------------------------------------------------

  /** Into a balloon's basket (E by it), or back out once it's down. Returns true if E was for that. */
  private useBalloon(): boolean {
    const B = this.balloons, p = this.player;
    if (B.aboard >= 0) {
      const out = B.leave();
      if (!out) { this.toast("Too high to climb out. S opens the vent to bring her down", 2.5); return true; }
      this.leftBalloon(out);
      return true;
    }
    if (!this.alive || this.riding || this.basket || p.ladder) return false;
    const near = B.near(p.pos.x, p.pos.y, p.pos.z);
    if (!near) return false;
    if (near.why) { this.toast(near.why, 2.5); return true; }
    B.board(near.b);
    this.balloonA = near.b.a;
    this.aiming = this.binoculars = false;
    this.toast(B.flying ? `You're flying ${near.b.name}. {burner} for the burner, {vent} for the vent, {steer} to turn` : `Aboard ${near.b.name}. Enjoy the view`, 3.5);
    this.sendState();
    return true;
  }

  /** Stepping out of the basket, onto the ground beside it. */
  private leftBalloon(out: { x: number; z: number }) {
    const p = this.player;
    p.spawn(out.x, out.z, p.yaw);
    p.vel.set(0, 0, 0);
    this.sendState();
  }

  /** The balloons, each frame: yours flown with W, S, A and D (or the stick), and everyone else's followed. */
  private flyBalloons(dt: number) {
    const B = this.balloons, p = this.player, k = p.keys, on = this.active && this.alive && !!B.flying;
    if (B.aboard >= 0 && !this.alive) B.leave(true);
    const key = (a: string, b: string) => on && (k.has(a) || k.has(b));
    const stick = on ? p.joy : { x: 0, y: 0 };
    const ctl = {
      burn: key("KeyW", "ArrowUp") || stick.y < -0.4,
      vent: key("KeyS", "ArrowDown") || stick.y > 0.4,
      turn: (key("KeyA", "ArrowLeft") ? 1 : 0) - (key("KeyD", "ArrowRight") ? 1 : 0) || (Math.abs(stick.x) > 0.3 ? -Math.sign(stick.x) : 0),
    };
    B.update(dt, ctl, this.isHost, (x, y, z) => this.hear(x, y, z));
    // come down hard and it hurts, a bit
    const hit = B.landed;
    if (hit > 3) {
      SFX.crash(Math.min(1, hit / 9), 0, 0);
      this.toast(hit > 6 ? "Bump! That was a hard landing" : "Bump!", 1.5);
      if (hit > 6) {
        const claim = { life: this.life, dmg: (hit - 6) * 8 };
        if (this.isHost) this.applyCrash(this.net.selfId, claim);
        else this.net.send("ow", claim, this.hostId);
      }
    }
  }

  /** Stood in a balloon's basket: carried along in it, looking (and shooting) about, and turning with it. */
  private inBalloon() {
    const p = this.player, at = this.balloons.standing(), b = this.balloons.mine;
    if (!at || !b) return;
    p.yaw += b.a - this.balloonA;
    this.balloonA = b.a;
    p.pos.set(at.x, at.y, at.z);
    p.vel.set(b.vx, b.vy, b.vz);
    p.onGround = true;
    p.speed = 0;
    p.crouch = 0;
    p.applyToCamera(this.camera);
  }

  /** Which way you're pushing the keys or the stick: x right, y forward, -1..1. */
  private pushing() {
    const p = this.player, k = p.keys, on = this.active && !this.reveal.on;
    const key = (a: string, b: string) => on && (k.has(a) || k.has(b));
    const x = (key("KeyD", "ArrowRight") ? 1 : 0) - (key("KeyA", "ArrowLeft") ? 1 : 0);
    const y = (key("KeyW", "ArrowUp") ? 1 : 0) - (key("KeyS", "ArrowDown") ? 1 : 0);
    return { x: x || (on ? p.joy.x : 0), y: y || (on ? -p.joy.y : 0) };
  }

  /** Held up by a job (a tightrope, a basket): stood where it says, looking about, the view tipped as it says. */
  private perched(at: Perch) {
    const p = this.player;
    if (at.face !== undefined) { p.yaw = at.face; p.pitch = 0; }
    p.pos.set(at.x, at.y, at.z);
    p.vel.set(0, 0, 0);
    p.onGround = true;
    p.speed = 0;
    p.crouch = 0;
    if (at.around) {
      const off = Math.atan2(Math.sin(p.yaw - at.around.yaw), Math.cos(p.yaw - at.around.yaw));
      p.yaw = at.around.yaw + Math.max(-at.around.max, Math.min(at.around.max, off));
    }
    p.applyToCamera(this.camera);
    this.camera.position.y -= at.low ?? 0;
    if (at.lean) { this.camera.position.x += at.lean.x; this.camera.position.z += at.lean.z; }
    this.camera.rotation.x += at.pitch ?? 0;
    this.camera.rotation.z += at.roll ?? 0;
    if (at.eye) { this.camera.position.set(at.eye.x, at.eye.y, at.eye.z); this.camera.lookAt(at.eye.lx, at.eye.ly, at.eye.lz); }
  }

  /** Into a mate's trolley (E by it), or back out. Returns true if E was for that. */
  private useBasket(): boolean {
    if (this.basket) { this.leaveBasket(); return true; }
    if (!this.alive || this.riding) return false;
    const r = this.trolleyNear();
    if (!r) return false;
    this.basket = r.id;
    this.toast(`In ${r.name}'s trolley. {use} to climb out`, 2.5);
    this.sendState();
    return true;
  }

  private leaveBasket() {
    const p = this.player, r = this.remotes.get(this.basket);
    this.basket = "";
    if (r) { const a = r.rideView?.heading ?? 0; p.spawn(p.pos.x + Math.cos(a) * 1.1, p.pos.z - Math.sin(a) * 1.1, p.yaw); }
    p.vel.set(0, 0, 0);
    this.sendState();
  }

  /** Someone pushing a trolley that's empty, within reach of its basket. */
  private trolleyNear(): Remote | null {
    const p = this.player.pos;
    for (const r of this.remotes.values()) {
      if (rideOf(r.rideCode) !== "trolley" || !r.avatar.alive || !r.rideView) continue;
      if ([...this.remotes.values()].some((o) => o.rideCode === IN_TROLLEY && Math.hypot(o.avatar.x - r.avatar.x, o.avatar.z - r.avatar.z) < 2)) continue;
      const h = r.rideView.heading, bx = r.avatar.x - Math.sin(h) * TROLLEY_AHEAD, bz = r.avatar.z - Math.cos(h) * TROLLEY_AHEAD;
      if (Math.hypot(bx - p.x, bz - p.z) < 1.8) return r;
    }
    return null;
  }

  /** Riding in a trolley's basket: carried along in it, looking (and shooting) about. */
  private inBasket() {
    const r = this.remotes.get(this.basket), p = this.player;
    if (!r || rideOf(r.rideCode) !== "trolley" || !r.avatar.alive || !this.alive) { this.leaveBasket(); return; }
    const h = r.rideView?.heading ?? r.avatar.yaw;
    const x = r.avatar.x - Math.sin(h) * TROLLEY_AHEAD, z = r.avatar.z - Math.cos(h) * TROLLEY_AHEAD;
    const g = this.map.ground(x, z);
    p.pos.set(x, g + 0.45, z);
    p.vel.set(0, 0, 0);
    p.crouch = 1;
    p.applyToCamera(this.camera);
  }

  /** Off your ride (player.ts tumbles you and puts you back on): only a hard crash into a wall hurts, and not much. */
  private crash(speed: number, wall: boolean) {
    const v = this.held ? rideSpecs[this.held] : null;
    SFX.crash(Math.max(0.25, Math.min(1, speed / 15)) * (wall ? 1 : 0.6), 0, 0);
    this.toast(anyOf(wall ? ["Ouch!", "Straight into the wall", "That'll leave a mark", "Wall 1, you 0"]
      : ["Bailed!", "Nearly", "Gravity wins", "Style points: none", "Up you get", "Ankles"]), 1.2);
    const over = speed - (v?.crash ?? 9);
    if (!wall || over < 2) return;
    const claim = { life: this.life, dmg: Math.min(25, over * 4) };
    if (this.isHost) this.applyCrash(this.net.selfId, claim);
    else this.net.send("ow", claim, this.hostId);
  }

  /** Everyone's rides, under them: yours, and the other players' from their position updates. */
  private drawRides(dt: number) {
    const p = this.player;
    this.myRide.set(this.riding && this.alive ? this.held : null);
    if (this.riding) this.myRide.pose(p.pos.x, p.pos.y, p.pos.z, this.map.ground(p.pos.x, p.pos.z), p.heading, p.rideV, dt, p.trick, p.manual ? 1 : 0, Math.min(1, p.tumble * 3), p.grind ? p.grind.style + 1 : 0);
    for (const r of this.remotes.values()) {
      const kind = r.avatar.alive ? rideOf(r.rideCode) : null;
      if (kind && !r.rideView) r.rideView = new RideView(this.world.scene);
      if (!r.rideView) continue;
      r.rideView.set(kind);
      if (!kind) continue;
      const a = r.avatar, mx = a.x - r.px, mz = a.z - r.pz, moved = Math.hypot(mx, mz);
      // it points the way they're going (a pogo stick, the way they face)
      const heading = rideSpecs[kind].pogo || moved < 0.02 ? (rideSpecs[kind].pogo ? a.yaw : r.rideView.heading) : Math.atan2(-mx, -mz);
      r.rideView.pose(a.x, a.y, a.z, this.map.ground(a.x, a.z), heading, moved / Math.max(dt, 1e-3), dt, 0, 0, 0, r.grindStyle);
      a.root.position.y += rideSpecs[kind].lift;
    }
  }

  /** Host: a train's hit someone (they say so). */
  private applyTrain(from: string, d: { life: number; s: number }) {
    if (!d || !Number.isFinite(d.life)) return;
    this.catchUpLife(from, d.life);
    this.hurt(from, 250, "train", false, d.life, RUN);
  }

  /** The canal and the trains, each frame: the host runs the canal; everyone moves the trains on. */
  private waterways(dt: number, host: boolean, helm: ReturnType<NonNullable<World["canal"]>["helmOf"]> | null) {
    const canal = this.world.canal, rail = this.world.railway, p = this.player.pos;
    if (canal) {
      if (host) canal.simulate(dt, this.targets());
      canal.update(dt, host, p.x, p.z);
      this.cnT -= dt;
      if (host && this.cnT <= 0) { this.cnT = 0.2; this.net.send("cn", canal.snapshot()); }
      if (helm) this.standAtTiller(helm, dt);
      else { this.boatYaw = null; this.wave = 0; this.bellWas = false; }
      this.drawSteerers(dt, helm);
    }
    if (rail) {
      const onTrain = !!this.carrier && rail.near.includes(this.carrier.m as never);
      const hit = rail.update(dt, p.x, p.y, p.z, this.alive && !this.ride && !onTrain);
      this.announcer.update(dt, rail, p.x, p.z);
      if (hit) {
        SFX.crash(1);
        const claim = { life: this.life, s: Math.round(hit.speed) };
        if (this.isHost) this.applyTrain(this.net.selfId, claim);
        else this.net.send("trh", claim, this.hostId);
      }
    }
    // the cable car's cabins run to the clock too; the doors and the chime sound for anyone near
    const cable = this.world.cableway;
    if (cable) for (const e of cable.update(p.x, p.z, dt)) {
      const [d, pan] = this.hear(e.x, e.y, e.z);
      if (e.kind === "door") SFX.door(d, pan);
      else { SFX.bell(3, d, pan); setTimeout(() => SFX.bell(1, d, pan), 450); }
    }
    // anyone riding a cabin was drawn where it was before it moved this frame: bring them along with it
    if (cable) for (const r of this.remotes.values()) { const b = r.cab ? cable.cabinAt(r.cab) : null; if (b) r.avatar.rebase(b); }
    // boats, the carriages and the cabins near you block like vehicles, and you can stand on them
    const M = this.map.movers;
    for (const m of this.solid) { const k = M.indexOf(m); if (k >= 0) M.splice(k, 1); }
    this.solid = [...(canal?.moving ?? []), ...(rail?.near ?? []), ...(cable?.near ?? []), ...this.quests.movers()];
    M.push(...this.solid);
    // whatever you're standing on has just moved: go with it, and so does the view
    if (this.carrier && !helm) {
      const was = this.player.pos.clone();
      this.carry();
      this.camera.position.add(this.player.pos.clone().sub(was));
    }
    const before = this.carrier?.m;
    this.findCarrier();
    // stood up on a boat's roof as it goes under a low bridge: it knocks you off into the cut
    const cm = this.carrier?.m;
    if (cm && canal && [...canal.moving].includes(cm as never)) {
      const over = this.map.overhead(this.player.pos.x, this.player.pos.z, this.player.pos.y + 0.5);
      if (over !== null && over - LOW_BRIDGE < this.player.pos.y + 1.0 + 0.7 * (1 - this.player.prone) && this.player.prone < 0.5) {
        const cs = Math.cos(cm.a), sn = Math.sin(cm.a), across = (this.player.pos.x - cm.x) * sn + (this.player.pos.z - cm.z) * cs, side = across >= 0 ? 1 : -1;
        this.player.vel.set(sn * side * 3.5, 1.5, cs * side * 3.5);
        this.player.pos.x += sn * side * (cm.hw + 0.3 - Math.abs(across));
        this.player.pos.z += cs * side * (cm.hw + 0.3 - Math.abs(across));
        this.carrier = null;
        this.toast("Low bridge! Lie flat on the roof ({prone}) to go under", 3);
      }
    }
    // stepping into a cable car cabin
    const cab = this.carrier && this.carrier.m !== before && cable ? cable.cabinOf(this.carrier.m) : null;
    if (cab) this.toast(cab.docked >= 0 ? `${cable!.line.name} to ${cab.to}. Doors close shortly` : `${cable!.line.name}, on its way to ${cab.to}`, 3);
  }

  /** Standing on something that moves: go with it (and turn as it turns). */
  private carry() {
    const c = this.carrier, p = this.player;
    if (!c) return;
    const m = c.m, da = m.a - c.a;
    if (m.x === c.x && m.z === c.z && !da && m.top === c.top) return;
    const rx = p.pos.x - c.x, rz = p.pos.z - c.z, cs = Math.cos(da), sn = Math.sin(da);
    p.pos.x = m.x + rx * cs + rz * sn;
    p.pos.z = m.z - rx * sn + rz * cs;
    p.pos.y += m.top - c.top;
    p.yaw += da;
    c.x = m.x; c.z = m.z; c.a = m.a; c.top = m.top;
  }

  /** What moving thing you're standing on now, if any. */
  private findCarrier() {
    const p = this.player.pos;
    this.carrier = null;
    if (this.ride || !this.alive || this.balloons.aboard >= 0) return;
    for (const m of this.solid) {
      if (Math.abs(p.y - m.top) > 0.3) continue;
      const cs = Math.cos(m.a), sn = Math.sin(m.a), dx = p.x - m.x, dz = p.z - m.z;
      if (Math.abs(dx * cs - dz * sn) < m.hl + 0.2 && Math.abs(dx * sn + dz * cs) < m.hw + 0.2) {
        this.carrier = { m, x: m.x, z: m.z, a: m.a, top: m.top };
        return;
      }
    }
    // inside a cable car cabin (or just above its roof) you go with it even mid-jump
    const m = this.world.cableway?.around(p.x, p.y, p.z);
    if (m) this.carrier = { m, x: m.x, z: m.z, a: m.a, top: m.top };
    const head = m ? this.world.cableway!.headroom(m) : null;
    if (head !== null && p.y > head) { p.y = head; this.player.vel.y = Math.min(0, this.player.vel.y); }
  }

  /**
   * Engines running for everything with someone at the wheel, near enough to hear (sirens and chimes carry further).
   * Each engine is a big sound to start, so one already running is kept a little further out (and a
   * place or two further down the nearest few) than it takes to start one: a car hovering at the edge
   * of hearing, or two swapping places in the queue, would otherwise start a fresh engine every frame
   * while the last one ran down, and dozens at once choke the sound until it breaks up.
   */
  private engineSounds() {
    for (const v of this.vehicles.list) {
      let e = this.engines.get(v);
      const [d, pan] = this.hear(v.x, v.y + 1, v.z);
      if (!v.driver || d > (v.siren ? 220 : 50) * (e ? 1.15 : 1)) {
        if (e) { e.stop(); this.engines.delete(v); }
        continue;
      }
      if (!e) {
        // one standing still close by has only just been started: you hear it turn over and catch
        const started = SFX.engine(v.spec.engine, v.spec.siren, d < 30 && Math.abs(v.speed) < 0.3);
        if (!started) continue;
        this.engines.set(v, (e = started));
      }
      // the one you're in sounds as if you're in it, not from where the camera trails behind; its
      // tyres squeal sliding sideways (a donut, the handbrake), and the front ones scrub wide in a corner taken too fast
      const side = Math.abs(v.vx * Math.sin(v.a) + v.vz * Math.cos(v.a));
      const skid = v.drift || v.hand ? 1 : Math.max(v.scrub * 0.6, Math.min(1, Math.max(0, (side - 2) / 4)));
      e.set(v.rpm, v.gas, v.horn, v === this.ride?.v ? Math.min(d, 2) : d, pan, v.siren, Math.min(1, Math.abs(v.speed) / v.spec.top), skid);
    }
    // the nearest few cars in the traffic
    const near = [...this.traffic.list].map((c) => ({ c, h: this.hear(c.x, c.y + 1, c.z) })).sort((a, b) => a.h[0] - b.h[0]);
    near.forEach(({ c, h: [d, pan] }, k) => {
      let e = this.engines.get(c);
      if (c.wreck || (e ? k >= 5 || d > 46 : k >= 4 || d > 40)) { if (e) { e.stop(); this.engines.delete(c); } return; }
      if (!e) {
        const started = SFX.engine("petrol");
        if (!started) return;
        this.engines.set(c, (e = started));
      }
      e.set(c.rpm, c.gas, c.horn, d, pan, false, Math.min(1, c.v / 14));
    });
    // narrowboats chugging along
    const canal = this.world.canal;
    const boats = canal ? [...canal.moving].map((b) => ({ b, h: this.hear(b.x, b.y + 1, b.z) })).sort((a, b) => a.h[0] - b.h[0]) : [];
    boats.forEach(({ b, h: [d, pan] }, k) => {
      let e = this.engines.get(b);
      if (e ? k >= 4 || d > 80 : k >= 3 || d > 70) { if (e) { e.stop(); this.engines.delete(b); } return; }
      if (!e) { const started = SFX.engine("boat"); if (!started) return; this.engines.set(b, (e = started)); }
      e.set(Math.min(1, Math.abs(b.v) / 2.8), b.gas, false, d, pan);
    });
    // the trains, and their horns
    const heard = new Set<string>(), q = this.player.pos;
    if (this.world.railway) for (const t of this.world.railway.audible(q.x, q.z, 700)) {
      if (heard.size >= 2) break;
      heard.add(t.key);
      let e = this.trainEngines.get(t.key);
      if (!e) { const started = SFX.engine(t.engine); if (!started) continue; this.trainEngines.set(t.key, (e = started)); }
      const [d, pan] = this.hear(t.x, t.y, t.z);
      e.set(Math.min(1, t.v / 38), t.v > 1 ? 1 : 0, t.horn, d / 3, pan, false, Math.min(1, t.v / 38));
    }
    for (const [k, e] of this.trainEngines) if (!heard.has(k)) { e.stop(); this.trainEngines.delete(k); }
    // water pouring through the paddles of a lock that's filling or emptying
    for (const [i, [x, y, z, vol]] of this.flowing) {
      const [d, pan] = this.hear(x, y, z);
      let r = this.rushes.get(i);
      if (d > 120) { if (r) { r.stop(); this.rushes.delete(i); } continue; }
      if (!r) { const started = SFX.rush(); if (!started) continue; this.rushes.set(i, (r = started)); }
      r.set(vol, d, pan);
    }
    for (const [i, r] of this.rushes) if (!this.flowing.has(i)) { r.stop(); this.rushes.delete(i); }
    this.flowing.clear();
    // and any that have gone
    const live = new Set<object>([...this.vehicles.list, ...this.traffic.list, ...(canal?.moving ?? [])]);
    for (const [o, e] of this.engines) if (!live.has(o)) { e.stop(); this.engines.delete(o); }
  }

  // ---- the host's own drivers: naughty boys arriving in a Nova, and buses coming into service --------
  /** A gang's on its way to (x, z): if there's a Nova free, it brings them, down the street out of sight. */
  private deliver(x: number, z: number, size: number): boolean {
    if ([...this.deliveries.values()].some((d) => !d.by) || Math.random() > DELIVERY_CHANCE) return false;
    const players = this.targets().filter((t) => t.alive), unseen = (px: number, pz: number, r: number) => !players.some((t) => Math.hypot(t.x - px, t.z - pz) < r);
    const route = this.routeTo(x, z);
    if (!route || !unseen(route[0].x, route[0].z, 50)) return false;
    const nova = this.vehicles.list.find((v) => v.kind === "nova" && !v.seats.some(Boolean) && unseen(v.x, v.z, 70));
    if (!nova) return false;
    const id = `@naughtyBoy${this.nextNaughtyBoy++}`;
    nova.place(route[0].x, route[0].z, Math.atan2(-(route[1].z - route[0].z), route[1].x - route[0].x));
    nova.seats.forEach((_, k) => { if (k < Math.min(nova.seats.length, size)) this.seatPerson(nova, k, `${id}.${k}`); });
    this.seatPerson(nova, 0, id);
    this.deliveries.set(nova, { route, k: 1, size, t: 0, stuck: 0 });
    this.sendVehicles();
    return true;
  }

  /**
   * A way in along the street nearest (x, z): about 70 m of it, ending double-parked by (x, z). Or,
   * given an end (a bus stop's kerb), coming in the way that pulls up there, down the middle and in.
   */
  private routeTo(x: number, z: number, end?: { x: number; z: number; a: number }): { x: number; z: number }[] | null {
    let best: { r: number[][]; i: number } | null = null, bd = 25;
    // Combe Down's streets, and the rest of Bath's
    const streets = [...this.map.d.rd, ...this.map.wide?.rd ?? []];
    for (const r of streets) {
      if (PATHS.has(r.c) || r.c === "service" || Math.abs(r.p[0][0] - x) > 1500 || Math.abs(r.p[0][1] + z) > 1500) continue;
      r.p.forEach((q, i) => { const d = Math.hypot(q[0] - x, -q[1] - z); if (d < bd) { bd = d; best = { r: r.p, i }; } });
    }
    if (!best) return null;
    const { r, i } = best as { r: number[][]; i: number };
    // streets come in pieces: where one ends, which others carry on from there
    const key = (q: number[]) => `${Math.round(q[0] * 2)},${Math.round(q[1] * 2)}`;
    if (!this.roadEnds) {
      this.roadEnds = new Map();
      for (const rd of streets) {
        if (PATHS.has(rd.c) || rd.c === "service" || rd.p.length < 2) continue;
        for (const at of [0, rd.p.length - 1]) {
          const k = key(rd.p[at]);
          (this.roadEnds.get(k) ?? this.roadEnds.set(k, []).get(k)!).push({ r: rd.p, at });
        }
      }
    }
    // walk back along the street (on round corners onto the next piece, the straightest way on) to where we'll start from
    const back = (from: number, step: number) => {
      const out: { x: number; z: number }[] = [];
      let run = 0, cur = r, j = from, s = step, hops = 0;
      while (run < 70) {
        if (j < 0 || j >= cur.length) {
          const end = cur[j < 0 ? 0 : cur.length - 1], n = out.length;
          const dx = n > 1 ? out[n - 1].x - out[n - 2].x : 0, dz = n > 1 ? out[n - 1].z - out[n - 2].z : 0;
          const on = (this.roadEnds!.get(key(end)) ?? []).filter((e) => e.r !== cur).map((e) => {
            const q = e.r[e.at === 0 ? 1 : e.r.length - 2];
            return { e, straight: (q[0] - end[0]) * dx + (-q[1] + end[1]) * dz };
          }).sort((a, b) => b.straight - a.straight)[0];
          if (!on || ++hops > 5) break;
          cur = on.e.r; s = on.e.at === 0 ? 1 : -1; j = on.e.at === 0 ? 1 : cur.length - 2;
          continue;
        }
        if (out.length) run += Math.hypot(cur[j][0] - out[out.length - 1].x, -cur[j][1] - out[out.length - 1].z);
        out.push({ x: cur[j][0], z: -cur[j][1] });
        j += s;
      }
      return { out: out.reverse(), run };
    };
    const a = back(i, -1), b = back(i, 1);
    let way = a.run >= b.run ? a : b;
    if (end) {
      // the end the bus comes in from: heading the way the stop wants it to face
      const fits = (w: typeof a) => {
        const o = w.out, n = o.length;
        return n > 1 && (o[n - 1].x - o[0].x) * Math.cos(end.a) - (o[n - 1].z - o[0].z) * Math.sin(end.a) > 0;
      };
      way = fits(a) ? a : b;
      if (!fits(way) || way.run < 30) return null;
      const road = way.out.filter((q) => Math.hypot(q.x - end.x, q.z - end.z) > 9);
      return road.length ? [...road, { x: end.x, z: end.z }] : null;
    }
    if (way.run < 30) return null;
    // down the middle (there are cars parked both sides), then double-park on the left to let them out
    return way.out.map((q, j, all) => {
      const n = all[Math.min(j + 1, all.length - 1)], m = all[Math.max(j - 1, 0)], dx = n.x - m.x, dz = n.z - m.z, l = Math.hypot(dx, dz) || 1;
      const off = j === all.length - 1 ? 1.2 : 0.4;
      return { x: q.x + (dz / l) * off, z: q.z - (dx / l) * off };
    });
  }

  /** Host: drive the naughty boys' Novas along their routes, and let the lads out when they get there. */
  private driveDeliveries(dt: number) {
    for (const [v, d] of this.deliveries) {
      // a bus that's there eases in to the kerb, then the driver gets off
      if (d.settle !== undefined && d.at) {
        const f = Math.min(1, dt * 3), da = Math.atan2(Math.sin(d.at.a - v.a), Math.cos(d.at.a - v.a));
        v.place(v.x + (d.at.x - v.x) * f, v.z + (d.at.z - v.z) * f, v.a + da * f);
        if ((d.settle += dt) < 1.2) continue;
        v.place(d.at.x, d.at.z, d.at.a);
        this.deliveries.delete(v);
        v.seats.forEach((_, k) => this.seatPerson(v, k, ""));
        v.usedAt = performance.now();
        this.broadcastEvent({ k: "bus", t: d.by, m: "here", kind: v.kind, v: v.i });
        this.sendVehicles();
        continue;
      }
      const wp = d.route[d.k], dx = wp.x - v.x, dz = wp.z - v.z, dist = Math.hypot(dx, dz), last = d.k === d.route.length - 1;
      if (!last && dist < 4) d.k++;
      const err = Math.atan2(Math.sin(Math.atan2(-dz, dx) - v.a), Math.cos(Math.atan2(-dz, dx) - v.a));
      const want = last ? Math.min(9, dist * 0.8) : Math.abs(err) > 0.5 ? 4 : 9, sp = v.speed;
      v.drive(dt, { throttle: sp < want ? 1 : sp > want + 1.5 ? -1 : 0, steer: Math.max(-1, Math.min(1, err * 2.5)), handbrake: false, horn: false }, (px, pz) => this.world.paved(px, pz));
      d.t += dt;
      d.stuck = Math.abs(sp) < 0.5 && d.t > 2 ? d.stuck + dt : 0;
      if (d.by && last && dist < 3) { d.settle = 0; continue; }
      if ((last && dist < 2.5) || d.stuck > 4 || d.t > 40) {
        this.deliveries.delete(v);
        v.seats.forEach((_, k) => this.seatPerson(v, k, ""));
        if (d.by) {
          // a bus that didn't make it pulls in anyway (it came round another way)
          if (!(last && dist < 2.5) && d.at) v.place(d.at.x, d.at.z, d.at.a);
          else v.place(v.x, v.z, v.a, v.tip);
          v.usedAt = performance.now();
          this.broadcastEvent({ k: "bus", t: d.by, m: "here", kind: v.kind, v: v.i });
        } else {
          // there: out they get, kerbside
          v.place(v.x, v.z, v.a, v.tip);
          const c = Math.cos(v.a), s = Math.sin(v.a);
          this.naughtyBoys.gangAt(v.x - s * (v.hw + 1.2), v.z - c * (v.hw + 1.2), d.size);
        }
        this.sendVehicles();
      }
    }
    // a Nova still being driven by naughty boys nobody's driving (the host before us was): it stops where it is
    for (const v of this.vehicles.list) if (v.driver.startsWith("@") && !this.deliveries.has(v)) {
      v.seats.forEach((_, k) => this.seatPerson(v, k, ""));
      this.sendVehicles();
    }
  }

  // ---- the zones -------------------------------------------------------------------------
  /** Which zone opens each way of getting about this map has (zones.ts), from where each one is. */
  private planTravel() {
    const W = this.world, found: TravelFind[] = [];
    const spawn = this.map.d.spawn?.[0] ?? [0, 0];
    if (W.vehicles.list.some((v) => v.kind === "bus" || v.kind === "minibus")) found.push({ kind: "bus", at: [[spawn[0], -spawn[1]]] });
    for (const route of busRouteSpots(this.mapId)) found.push({ kind: "busroute", at: route, all: true });
    const canal = this.map.canalData?.runs.flatMap((r) => r.p.filter((_, i) => i % 20 === 0).map((q) => [q[0], -q[1]] as [number, number])) ?? [];
    if (W.canal && canal.length) found.push({ kind: "boat", at: canal });
    if (this.balloons.list.length) found.push({ kind: "balloon", at: this.balloons.list.map((b) => [b.x, b.z]) });
    const R = this.map.railData, linked = new Set((R?.links ?? []).map((l) => l.station));
    const stations = (R?.platforms ?? []).filter((p) => linked.has(p.n) && p.r.length).map((p) => [p.r[0][0], -p.r[0][1]] as [number, number]);
    if (W.railway && stations.length) found.push({ kind: "train", at: stations });
    const cab = this.map.cable?.d.st ?? [];
    if (W.cableway && cab.length === 2) found.push({ kind: "cable", at: cab.map(([, x, y]) => [x, -y] as [number, number]), all: true });
    this.zones.planTravel(found);
    if (W.railway) W.railway.shutAt = (x, z) => !this.zones.can("train") || this.map.fieldEdge(x, z) < 0;
  }

  /** Each frame: when the wall's moved, the maps and the ways of getting about catch up; and at the wall, it says why. */
  private zoneUpkeep() {
    const Z = this.zones;
    // the buses come in with the village's squares, after the game's begun
    if (!Z.has("bus") && this.vehicles.list.some((v) => v.kind === "bus" || v.kind === "minibus")) this.planTravel();
    if (this.zonesSeen !== Z.version) {
      this.zonesSeen = Z.version;
      this.minimap.zones = this.map.zoneFence ? { shut: Z.shutCells(), wall: Z.edges(), names: Z.list.map((z) => ({ n: z.name, x: z.x, z: z.z, open: Z.isOpen(z.i) })) } : null;
      this.balloons.shut = Z.can("balloon") ? "" : Z.shut("balloon");
      if (this.world.cableway) this.world.cableway.shut = !Z.can("cable");
      this.minimap.spots = this.gameSpots();
    }
    const p = this.player.pos, now = performance.now(), fence = this.map.zoneFence;
    // Walking never gets you past the wall, so you were put there (a link, Go to, a journey, or the
    // wall going up round you). The collisions alone would shove you onto the wall's line in one
    // step, however far, perhaps into a house: clear ground just inside it instead.
    if (fence && this.alive && !this.car && !this.ride && this.balloons.aboard < 0 && fence.edge(p.x, p.z) < -2) {
      const [ix, iz] = this.map.fieldInside(p.x, p.z, 2);
      const [x, z] = clearSpot(this.map, ix, iz, 25) ?? [ix, iz];
      this.player.spawn(x, z, this.player.yaw);
      this.landing = { t: 20 };
      this.wallSaid = 0;
      this.sendState();
    }
    if (fence && now > this.wallSaid && this.alive && fence.edge(p.x, p.z) < 4 && this.map.fieldEdgeBase(p.x, p.z) > 4) {
      this.wallSaid = now + 15000;
      const next = Z.list[Z.open], cur = Z.current(this.oddments.filled);
      this.toast(cur && next ? `The wall stops you here. Fill the structure in ${cur.name} to open ${next.name}` : "The wall stops you here", 3.5);
    }
  }

  // ---- calling a bus ----------------------------------------------------------------------
  /** The bus stop you're standing at (in Combe Down or out in Bath), if any. */
  private stopNear(): Stop | null {
    const p = this.player.pos, V = this.vehicles;
    const ok = (s: Stop) => { let k = this.stopOk.get(s); if (k === undefined) this.stopOk.set(s, (k = !!V.stopSpot(s, "minibus"))); return k; };
    return V.stopsNear(p.x, p.z, STOP_REACH).find(ok) ?? null;
  }

  /** 1 or 2 at a stop: ask the host for a minibus or a double-decker. */
  callBus(kind: Vehicle["kind"]) {
    const stop = this.busStop;
    if (this.busMenu <= performance.now() || !stop || !this.alive) return;
    this.busMenu = 0;
    Telemetry.note("bus:" + kind);
    Trophies.tally("bus");
    // which of Combe Down's stops (as older hosts know them), and where it is (for one out in Bath)
    const claim = { s: this.vehicles.stops.indexOf(stop), at: [stop.x, stop.z, stop.a], kind, life: this.life };
    if (this.isHost) this.applyCall(this.net.selfId, claim);
    else this.net.send("call", claim, this.hostId);
  }

  /**
   * Host: someone at a stop wants a bus. A spare one of that kind (one nobody's in, out of sight if
   * we can) starts down the street and a Badgerline driver brings it in to the kerb, then gets off.
   */
  private applyCall(from: string, d: { s: number; at?: number[]; kind: string; life: number }) {
    const pt = Array.isArray(d?.at) && d.at.length === 3 && d.at.every(Number.isFinite) ? d.at : null;
    const stop = this.vehicles.stops[d?.s] ?? (pt ? this.vehicles.stopsNear(pt[0], pt[1], 3)[0] ?? { x: pt[0], z: pt[1], a: pt[2] } : undefined), kind = d?.kind === "bus" ? "bus" : "minibus", s = this.entry(from), now = performance.now();
    const who = this.posOf(from), say = (m: string, v = -1) => this.broadcastEvent({ k: "bus", t: from, m, kind, v });
    if (!stop || !who || !s.alive || s.life !== d.life || Math.hypot(who.x - stop.x, who.z - stop.z) > 10) return;
    if (now - (this.callAt.get(from) ?? -1e9) < CALL_GAP) return say("wait");
    const at = this.vehicles.stopSpot(stop, kind);
    if (!at) return say("full");
    const players = this.targets().filter((t) => t.alive), seen = (x: number, z: number, r: number) => players.some((t) => Math.hypot(t.x - x, t.z - z) < r);
    // one that's already there will do
    const there = this.vehicles.list.find((v) => v.kind === kind && Math.hypot(v.x - at.x, v.z - at.z) < 6 && v.freeSeat() >= 0);
    if (there) return say("here", there.i);
    // a spare one: out of sight if there is, otherwise the one furthest from anyone
    const spare = this.vehicles.list.filter((v) => v.kind === kind && !v.seats.some(Boolean) && now - v.usedAt > 60000);
    const dist = (v: Vehicle) => Math.min(...players.map((t) => Math.hypot(t.x - v.x, t.z - v.z)), 1e9);
    const bus = spare.sort((a, b) => dist(b) - dist(a))[0];
    if (!bus) return say("none");
    this.callAt.set(from, now);
    const route = this.routeTo(stop.x, stop.z, at);
    if (route && !seen(route[0].x, route[0].z, 40) && route.every((q) => this.map.fieldEdge(q.x, q.z) > 3)) {
      bus.place(route[0].x, route[0].z, Math.atan2(-(route[1].z - route[0].z), route[1].x - route[0].x));
      this.seatPerson(bus, 0, "@bus");
      this.deliveries.set(bus, { route, k: 1, size: 0, t: 0, stuck: 0, by: from, at });
      say("coming", bus.i);
    } else {
      // no way in out of sight: it's simply there when you look round
      bus.place(at.x, at.z, at.a);
      bus.usedAt = now;
      say("here", bus.i);
    }
    this.sendVehicles();
  }

  /** The host's answer to our call for a bus. */
  private onBus(d: { m: string; kind: string; v: number }) {
    const what = d.kind === "bus" ? "double-decker" : "minibus";
    if (d.m === "coming") { this.myBus = d.v; this.toast(`A ${what} is on its way. It's the green dot on the map`, 3); }
    else if (d.m === "here") { this.myBus = -1; SFX.door(); this.toast(`Your ${what} is here. {use} to get on`, 3); }
    else if (d.m === "none") this.toast(`No ${d.kind === "bus" ? "double-deckers" : "minibuses"} free. Try the other one`, 2.5);
    else if (d.m === "full") this.toast(`There's no room for a ${what} at this stop`, 2.5);
    else if (d.m === "wait") this.toast("You've just called one. Give it a minute", 2);
  }

  /** Host: now and then a bus nobody's using comes back into service at a stop, out of everyone's sight. */
  private busService() {
    const players = this.targets().filter((t) => t.alive), now = performance.now();
    const unseen = (x: number, z: number, r: number) => !players.some((t) => Math.hypot(t.x - x, t.z - z) < r);
    const buses = this.vehicles.list.filter((v) => (v.kind === "bus" || v.kind === "minibus") && !v.seats.some(Boolean) && now - v.usedAt > 120000 && unseen(v.x, v.z, 150));
    if (!buses.length) return;
    const v = buses[Math.floor(Math.random() * buses.length)];
    const stops = this.vehicles.allStops().filter((s) => unseen(s.x, s.z, 120) && this.map.fieldEdge(s.x, s.z) > 10
      && !this.vehicles.list.some((o) => o !== v && Math.hypot(o.x - s.x, o.z - s.z) < 12));
    for (let tries = 0; tries < 6 && stops.length; tries++) {
      const at = this.vehicles.stopSpot(stops[Math.floor(Math.random() * stops.length)], v.kind);
      if (at) { v.place(at.x, at.z, at.a); v.usedAt = now; this.sendVehicles(); return; }
    }
  }

  private broadcastEvent(e: object) {
    this.net.send("ev", e);
    this.onEvent(e);
  }

  private sendScores() {
    for (const [id, r] of this.remotes) this.entry(id).name = r.name;
    this.entry(this.net.selfId).name = this.name;
    this.net.send("sb", this.scores);
    if (!$("scoreboard").hidden) this.renderScores();
  }

  // ---- shooting ----------------------------------------------------------------------------
  private shoot() {
    const w = this.weapon, p = this.player;
    if (!w.canFire) {
      if (w.kind !== "fists" && w.rounds === 0 && w.cooldown <= 0 && w.reloading <= 0 && w.switching <= 0) {
        if (w.startReload()) this.reloadSound = SFX.reload(w.kind === "sniper" ? "sniper" : "rifle");
        else { w.dry(); SFX.dryFire(); }
      }
      return;
    }
    const kind = w.kind, slot = SLOTS.indexOf(kind), gun = w.gun, melee = kind === "fists";
    w.fire();
    rumble(melee ? 0.3 : 0.15, 0.35, kind === "sniper" ? 120 : 45);
    Telemetry.count("shot:" + kind);
    if (melee) SFX.swing();
    else SFX.shot(0, 0, kind === "sniper");
    if (kind === "sniper" && w.sniperAmmo > 0) SFX.bolt();
    if (kind === "rifle" && w.ammo === 0) SFX.lastRound();
    const origin = this.camera.position.clone();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    // hopping a low wall you walked into doesn't throw your aim like a jump does
    const spread = w.spread(Math.min(1, p.speed / 5), !p.onGround && !p.vaulting);
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    dir.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
    // recoil: it settles back down once you stop firing
    p.kick(gun.recoil * (1 - w.aim * 0.4));
    this.sinceShot = 0;
    p.yaw += (Math.random() - 0.5) * gun.recoil * 0.55;

    const wall = this.map.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, gun.range);
    let maxD = wall ? wall.dist : gun.range;
    let victim: Remote | null = null, head = false;
    for (const r of this.remotes.values()) {
      const h = r.avatar.hit(origin, dir);
      if (h && h.dist < maxD) { maxD = h.dist; victim = r; head = h.head; }
    }
    let naughtyBoy = this.naughtyBoys.hit(origin, dir, maxD);
    if (naughtyBoy) { maxD = naughtyBoy.dist; victim = null; head = naughtyBoy.head; }
    let cat = this.cats.hit(origin, dir, maxD);
    if (cat) { maxD = cat.dist; victim = null; head = cat.head; }
    let boss = this.bendy.hit(origin, dir, maxD);
    if (boss) { maxD = boss.dist; victim = null; naughtyBoy = null; cat = null; head = boss.head; }
    // the BMW's owner: rounds stop at him, but he can't be hurt
    const bloke = !boss ? this.breakdown.hit(origin, dir, maxD) : null;
    if (bloke !== null) { maxD = bloke; victim = null; naughtyBoy = null; cat = null; }
    // and Jamie the same (jamie.ts)
    const jamie = !boss && bloke === null ? this.jamie.hit(origin, dir, maxD) : null;
    if (jamie !== null) { maxD = jamie; victim = null; naughtyBoy = null; cat = null; }
    // and Bendy by day (daybendy.ts)
    const teacher = !boss && bloke === null && jamie === null ? this.dayBendy.hit(origin, dir, maxD) : null;
    if (teacher !== null) { maxD = teacher; victim = null; naughtyBoy = null; cat = null; }
    // or one of the Flag Lads' flags on a lamp post
    const flag = melee ? null : this.invasion.hit(origin, dir, maxD);
    if (flag) { maxD = flag.dist; victim = null; naughtyBoy = null; cat = null; boss = null; this.invasion.shoot(flag); this.hitT = 0.18; $("hitmarker").classList.remove("head"); SFX.hitMarker(false); }
    // or a string of bunting between them
    const bunting = melee || flag ? null : this.invasion.hitBunting(origin, dir, maxD);
    if (bunting) { maxD = bunting.dist; victim = null; naughtyBoy = null; cat = null; boss = null; this.invasion.shootBunting(bunting); this.hitT = 0.18; $("hitmarker").classList.remove("head"); SFX.hitMarker(false); }
    // or a cable tie on a scar's banner, or a gull's nest
    const scarTarget = melee ? null : this.scars.hit(origin, dir, maxD);
    if (scarTarget) { maxD = scarTarget.dist; victim = null; naughtyBoy = null; cat = null; boss = null; this.scars.shoot(scarTarget); this.hitT = 0.18; $("hitmarker").classList.remove("head"); SFX.hitMarker(false); }
    // or something a job's put up to shoot at (a seagull)
    const quarry = this.quests.hit(origin, dir, maxD);
    if (quarry) { maxD = quarry.dist; victim = null; naughtyBoy = null; cat = null; boss = null; this.quests.shoot(quarry, kind === "sniper" ? 4 : melee ? 2 : 1); this.hitT = 0.18; $("hitmarker").classList.toggle("head", quarry.head); SFX.hitMarker(quarry.head); }
    const end = origin.clone().addScaledVector(dir, maxD);
    const muzzle = new THREE.Vector3(0.2 * (1 - w.aim), -0.15 - 0.015 * w.aim, kind === "sniper" ? -1.1 : -0.9).applyQuaternion(this.camera.quaternion).add(origin);
    const paint = !melee && !gore(), mine = paintFor(colourFor(this.net.selfId)), heavy = kind === "sniper";
    // in paintball, what happens where it lands waits for the paintball to get there
    let lands: (() => void) | undefined, chase: Follow | undefined;
    if (!melee && !paint) this.effects.tracer(muzzle, end, kind === "sniper" ? "#fff4d0" : undefined, kind === "sniper" ? 0.35 : 0.07);
    let mark = 0;
    if (victim || naughtyBoy || cat || boss || (quarry && !melee)) {
      mark = 2;
      // whoever it hit is moving: the paintball goes after the spot on them, and bursts there
      chase = paint ? this.follower(origin, dir, maxD) ?? undefined : undefined;
      const at = chase;
      if (melee) SFX.punch();
      else if (paint) lands = () => this.paintLands(muzzle, at ? at() : end, 2, mine, heavy, undefined, undefined, null, at?.obj);
      else {
        this.goreHit(end, dir, head, kind === "sniper");
        SFX.impact("body", ...this.hear(end.x, end.y, end.z), kind === "sniper");
      }
      if (!quarry) {
        this.hitT = 0.18;
        $("hitmarker").classList.toggle("head", head);
        SFX.hitMarker(head);
      }
    }
    // a miss counts as a shot at someone only if it wasn't at something else
    const atNobody = !victim && !naughtyBoy && !cat && !boss && !quarry;
    for (const r of this.remotes.values()) if (r === victim || (atNobody && r.avatar.alive && nearLine(origin, end, r.avatar.x, r.avatar.y + 1, r.avatar.z) < SHOT_NEAR)) this.traded(r.id);
    if (victim) {
      const claim = { t: victim.id, head, life: victim.life, w: slot, x: this.boostT > 0 || this.smokeT > 0 ? 2 : 1 };
      if (this.isMatchHost) this.applyHit(this.net.selfId, claim);
      else this.net.send("hit", claim, this.matchHostId);
    } else if (boss) {
      const claim = { g: boss.gen, head, w: slot, x: this.boostT > 0 || this.smokeT > 0 ? 2 : 1 };
      if (this.isHost) this.applyBendyHit(this.net.selfId, claim);
      else this.net.send("bhit", claim, this.hostId);
    } else if (cat) {
      const claim = { c: cat.i, g: cat.gen, head, w: slot, x: this.boostT > 0 || this.smokeT > 0 ? 2 : 1 };
      if (this.isHost) this.applyCatHit(this.net.selfId, claim);
      else this.net.send("khit", claim, this.hostId);
    } else if (naughtyBoy) {
      const claim = { c: naughtyBoy.i, g: naughtyBoy.gen, head, w: slot, x: this.boostT > 0 || this.smokeT > 0 ? 2 : 1 };
      if (this.isHost) this.applyNaughtyBoyHit(this.net.selfId, claim);
      else this.net.send("chit", claim, this.hostId);
    } else if (bloke !== null) {
      mark = 1;
      if (melee) SFX.punch();
      else if (!paint) this.effects.impact(end, dir.clone().negate(), "#1f2a44", 4);
      this.breakdown.ouch(maxD);
    } else if (jamie !== null) {
      mark = 1;
      if (melee) SFX.punch();
      else if (!paint) this.effects.impact(end, dir.clone().negate(), "#45502f", 4);
      this.jamie.ouch(maxD);
    } else if (teacher !== null) {
      mark = 1;
      if (melee) SFX.punch();
      else if (!paint) this.effects.impact(end, dir.clone().negate(), "#151317", 4);
      this.dayBendy.ouch(maxD);
    } else if (wall && !melee && !quarry) {
      mark = 1;
      const n = new THREE.Vector3(wall.nx, wall.ny, wall.nz);
      const col = wall.kind === "ground" ? "#6b5a3e" : wall.kind === "tree" ? "#5a4630" : "#d8c9a4";
      const body = paint ? this.paintOnCar(origin, dir, wall) : null;
      if (body) chase = follow(body.part, body.part.localToWorld(body.p.clone()));
      if (paint) lands = () => this.paintLands(muzzle, end, 1, mine, heavy, n, wall.kind, body);
      else {
        this.effects.impact(end, n, col, 6);
        SFX.impact(wall.kind, ...this.hear(end.x, end.y, end.z), kind === "sniper");
      }
    }
    if (paint) this.effects.paintball(muzzle, end, mine, heavy ? PAINT_SPEED_SNIPER : PAINT_SPEED, lands, chase, heavy);
    if (melee) return;
    const q = (v: number) => Math.round(v * 100) / 100;
    this.net.send("shot", [q(muzzle.x), q(muzzle.y), q(muzzle.z), q(end.x), q(end.y), q(end.z), mark, kind === "sniper" ? 1 : 0]);
  }

  private sendState() {
    // the host chooses passive mode for the game: changing your own setting changes it, if you're host
    if (myPassive !== this.myPassiveWas) {
      this.myPassiveWas = myPassive;
      if (this.isHost) this.setRoomPassive(myPassive);
      else if (myPassive !== this.passive) this.toast("The host decides passive mode for this game", 3);
    }
    if (this.isHost) this.setRoomFeatures(myFeatures);
    const p = this.player, q = (v: number) => Math.round(v * 100) / 100, seat = this.car?.seat(), sat = !!this.ride;
    this.net.send("st", [q(p.pos.x), q(p.pos.y), q(p.pos.z), q(seat ? seat.yaw : p.yaw), seat ? 0 : q(p.pitch), sat || this.basket ? 1 : q(p.crouch),
      this.alive ? 1 : 0, this.life, this.sentTalk = this.voice.mode, sat ? 0 : q(p.prone), this.torchOn ? 1 : 0,
      this.basket ? IN_TROLLEY : this.riding ? rideCode(this.held) : 0,
      // and the rest by name (StateExtra), leaving out whatever's off
      stripped({ cab: this.cabinSpot()?.map(q), bal: this.balloonSpot()?.map(q), passive: this.passive, host: this.isHost, wings: p.wings, glow: this.wings.glowing, car: !!this.ride, smoke: this.smokeT > 0, rw: this.quests.waiting(), gr: this.riding && p.grind ? p.grind.style + 1 : 0, wv: this.wave, vl: this.sentLevel = voiceLevel.code(), ft: this.isHost ? packFeatures(myFeatures) : 0 })]);
  }

  /** Which balloon's basket you're in and where you are in it, or undefined. */
  private balloonSpot() {
    const p = this.player.pos;
    return this.alive ? this.balloons.local(p.x, p.y, p.z) : undefined;
  }

  /** Which cable car cabin you're riding and where you are in it, or null. */
  private cabinSpot() {
    const p = this.player.pos;
    return this.carrier ? this.world.cableway?.local(this.carrier.m, p.x, p.y, p.z) ?? null : null;
  }

  // ---- frame ------------------------------------------------------------------------------
  update(dt: number) {
    dt *= this.invasion.timeScale(dt);
    const now = performance.now();
    const p = this.player, w = this.weapon;
    // lined up to kick or bowl, you stand still and the keys steer the ball; and you stand and watch it go
    const lining = this.sports.lining, filming = this.broadcast.on;
    if (this.useKey) {
      this.useKey = false;
      if (!this.car && this.alive && this.mineTour.near(p.pos.x, p.pos.z, p.pos.y)) this.goDownMine();
      else if (!this.car && this.alive && this.deliDoor.near(p.pos.x, p.pos.z, p.pos.y)) this.goInDeli();
      else if (!this.car && !this.ride && this.alive && this.golfDriver.use()) { /* the tape on the Golf Driver's seat */ }
      else if (!this.car && !this.ride && this.quests.use()) { /* a job */ }
      else if (!this.car && !this.ride && this.invasion.use()) { /* cuffing the Gaffer */ }
      else if (!this.car && !this.ride && this.scars.use()) { /* putting right what a lost job left */ }
      else if (!this.car && !this.ride && this.alive && this.sports.use(p)) { /* in goal for a penalty shoot-out */ }
      else if (!this.car && !this.ride && this.useBalloon()) { /* in or out of a balloon's basket */ }
      else if (!this.car && !this.ride && this.useBasket()) { /* in or out of a trolley */ }
      else if (!this.ride && this.canalUse()) { /* a tiller or a lock */ }
      else if (!this.car && !this.ride && this.oddments.use(this.woodMe(), this.isHost, this.held ?? undefined)) { /* one of the strange objects */ }
      else if (!this.car && !this.ride && this.bonfire.use(this.woodMe(), this.isHost)) { /* a bundle of wood for the bonfire */ }
      else if (!this.car && !this.ride && this.useSwap()) { /* swap what you're carrying for what's here */ }
      else if (!this.car && !this.ride && this.useLadder()) { /* up against a wall, or taken down */ }
      else if (!this.car && this.trainUse()) { /* on a train bound for another town (railway.ts) */ }
      else this.useVehicle();
    }
    // (a door found in a square that's just loaded goes on the maps)
    if (+this.mineTour.update(now / 1000) | +this.deliDoor.update(now / 1000)) {
      this.minimap.spots = this.gameSpots();
      const out = this.upFrom === "deli" ? this.deliDoor.outside() : this.upFrom ? this.mineTour.outside() : undefined;
      if (out && this.alive && !this.ride) { this.player.spawn(out.x, out.z, out.yaw); this.landing = null; this.upFrom = null; this.sendState(); }
    }
    this.breakdown.update(dt, now / 1000, p.pos.x, p.pos.y, p.pos.z);
    if (this.jamie.update(dt, now / 1000, p.pos.x, p.pos.y, p.pos.z, this.alive, this.smokeT <= 0 && this.jamieRest <= 0)) this.lightUp();
    this.dayBendy.update(dt, p.pos.x, p.pos.y, p.pos.z);
    this.records.update(dt, p.pos.x, p.pos.y, p.pos.z);
    this.golfDriver.update(dt, this.vehicles.list, (v) => this.vehicles.of(this.net.selfId)?.v === v, p.pos.x, p.pos.y, p.pos.z);
    this.flash.update(dt);
    this.bonfire.update(dt, now / 1000, this.woodMe(), this.holders(), this.isHost);
    this.oddments.update(dt, now / 1000, this.woodMe(), this.holders(), this.isHost, this.camera);
    this.zoneUpkeep();
    if (!this.reveal.on) { const shot = this.oddments.nextShot(); if (shot) this.reveal.play(shot, this.camera, { x: p.pos.x, z: p.pos.z }); }
    this.quests.update(dt, now / 1000);
    this.invasion.update(dt);
    this.night.update(dt);
    if ((this.yourT -= dt) <= 0) { this.yourT = 1; if (this.alive) Yours.here(p.pos.x, p.pos.z); Paper.meter(this.invasion.meter); this.showMine(); }
    Paper.photo(this.world.scene);
    this.scars.update(dt);
    this.updateDaily();
    this.land(dt);
    if (this.askedCar >= 0 && now - this.askedAt > 6000) this.askedCar = -1;   // no answer from the host
    const car = this.car, ride = this.ride;
    const helm = this.alive && !ride ? this.world.canal?.helmOf(this.net.selfId) ?? null : null;
    if (!helm && this.helmWas !== null) this.letGo();
    this.helmWas = helm ? helm.n : null;
    const aloft = this.balloons.aboard >= 0;
    const perch = !car && !ride && !helm && !this.basket && !aloft && this.alive ? this.quests.perch(dt, this.pushing()) : null;
    this.perchBare = !!perch?.eye || !!perch?.bare;
    if (car || ride || helm || this.basket || aloft || perch) p.ladder = null;
    if (!ride && !helm && !aloft) this.carry();
    this.flyBalloons(dt);
    // driving a bus: the 2 or the 4
    const driving = car && (car.kind === "bus" || car.kind === "minibus") ? car : null;
    if (driving && !this.zones.can("busroute") && this.routeShut !== driving.i && busRouteSpots(this.mapId).length) { this.routeShut = driving.i; this.toast(this.zones.shut("busroute"), 3); }
    this.busDriver.update(dt, driving && this.zones.can("busroute") ? driving : null, () => this.vehicles.allStops());
    if (car) this.driveCar(dt, car);
    else if (ride) this.rideAlong(ride.seat, ride.v);
    else if (helm) this.atTiller(dt, helm);
    else if (this.basket) this.inBasket();
    else if (aloft) this.inBalloon();
    else if (perch) this.perched(perch);
    else {
      p.ladders = this.alive ? [...this.ladders.near(p.pos.x, p.pos.z), ...abbeyLadders(this.map, p.pos.x, p.pos.z)] : [];
      if (!this.alive || (p.ladder && !p.ladders.some((L) => L === p.ladder))) p.ladder = null;   // taken down from under you
      const held = this.quests.held();   // on a race's start line in the countdown: held still
      // no mouse captured (an iPad with a keyboard, a touch screen): the arrow keys look round instead of walking
      p.arrowsWalk = !this.freeMode;
      if (this.freeMode) this.arrowLook(dt, this.active && this.alive && !this.mapOpen && !lining && !filming && !this.reveal.on && !placeNow());
      p.update(dt, this.active && this.alive && !this.mapOpen && !lining && !filming && !held && !this.sports.diving && !this.reveal.on);
      if (held) { p.pos.x = held.x; p.pos.z = held.z; p.vel.x = p.vel.z = 0; p.rideV = 0; if (held.y !== undefined) { p.pos.y = held.y; p.vel.y = 0; } }
      if (p.crashed) this.crash(p.crashed, p.crashWall);
      p.applyToCamera(this.camera);
      // the sniper's scope wanders, and the shot goes where it points
      this.camera.rotation.y += w.drift.x;
      this.camera.rotation.x += w.drift.y;
    }
    // killed out of a race that's still on: watching from behind someone still riding
    const watching = !this.alive ? this.quests.spectate() : null;
    if (watching) { this.camera.position.set(watching.x, watching.y, watching.z); this.camera.lookAt(watching.lx, watching.ly, watching.lz); }
    this.footsteps(dt);
    p.assist = this.freeMode;
    const onRide = this.riding && this.alive && !car && !ride && !helm && !this.basket && !aloft;
    this.rideTricks.update(dt, p, onRide ? this.held : null, onRide ? this.camera : null);
    // aiming, shooting or starting a reload breaks off a sprint; sprinting again lowers the sights
    // and cuts a reload short, as in Call of Duty
    const reloadBegan = w.reloading > 0 && !this.wasReloading;
    if (p.sprinting && (this.aiming && !this.wasAiming || this.firing || this.shootOnce || reloadBegan)) p.holdOffSprint();
    else if (p.sprinting && w.reloading > 0) w.cancelReload();
    this.wasAiming = this.aiming;
    this.wasReloading = w.reloading > 0;
    if (p.sprinting || !this.alive || car || helm) this.aiming = this.binoculars = false;
    this.bino = Math.max(0, Math.min(1, this.bino + (this.binoculars ? dt : -dt) * 5));
    // out of rounds: the rifle if it has any, else fists
    if (this.alive && !w.has(w.kind) && w.gun.interval - w.cooldown > 0.5) {
      const to: GunKind = w.has("rifle") ? "rifle" : "fists";
      this.switchTo(to);
      this.toast(w.kind === "rifle" ? "Out of sniper rounds" : "Out of ammo. Fists it is", 2);
    }
    this.kickAtGoal(dt, lining, filming);
    // pulling the trigger lowers the binoculars rather than shooting
    if (this.binoculars && (this.firing || this.shootOnce)) this.binoculars = this.firing = false;
    else if (this.active && this.alive && (this.firing || this.shootOnce) && !p.sprinting && !p.diveBusy && !lining && !this.sports.lining && !filming && !car && !helm && !this.scars.spray(this.camera)) this.shoot();
    this.shootOnce = false;
    if ((this.sinceShot += dt) > KICK_WAIT) p.settle(dt);
    this.boostT = Math.max(0, this.boostT - dt);
    if (this.smokeT > 0 && (this.smokeT -= dt) <= 0) { this.smokeT = 0; this.toast("Your ciggie's gone out", 2); this.sendState(); }
    this.jamieRest = Math.max(0, this.jamieRest - dt);
    // seagull muck slows you down (gulls.ts)
    this.slowT = Math.max(0, this.slowT - dt);
    // one of the strange objects in your arms: no sprinting, and a little slower
    const lugging = this.oddments.carrying(this.net.selfId);
    p.speedMul = (this.slowT > 0 ? 0.55 : 1) * (lugging ? 0.85 : 1);
    p.noSprint = lugging;
    this.rideMulT = Math.max(0, this.rideMulT - dt);
    p.rideMul = this.rideMulT > 0 ? this.rideMulV : 1;
    // tummy time counts towards a baby's bonnet
    if (this.alive && p.prone > 0.8 && (this.tummyT += dt) >= 10) { if (wardCount("tummy", this.tummyT) >= 600) earn("bonnet"); this.tummyT = 0; }
    const look = this.lastLook;
    // stood about doing nothing for a while: say something, and again every minute or so after
    const idle = this.active && this.alive && p.speed < 0.2 && !this.firing && !look.dx && !look.dy;
    this.idleT = idle ? this.idleT + dt : 0;
    if (this.idleT > IDLE_LINE) { Quips.idle(); this.idleT = IDLE_LINE - 60; }
    w.paint(paintFor(colourFor(this.net.selfId)));
    w.indoors = this.world.indoors;
    w.update(dt, this.camera, this.aiming && this.alive, p.bob, p.speed, p.sprinting, p.crouch, look.dx, look.dy, this.voice.mode === 2 && this.alive);
    // a reload cut short (a weapon switch, a pickup) stops sounding like one
    if (this.reloadSound && w.reloading <= 0) { this.reloadSound.stop(); this.reloadSound = null; }
    const tv = this.broadcast.on;
    this.wings.update(dt, p, this.camera, this.alive && !car && !ride && !helm && !this.basket && !aloft);
    w.model.visible = this.alive && !this.perchBare && !this.wings.on && !this.scoped && !this.sports.lining && this.bino < 0.5 && !tv && !car && !helm;
    if (this.scoped || this.bino >= 0.5 || tv || car || helm) w.radioHand.visible = false;
    // on a bike, a BMX or a scooter, its handlebars in front of you
    const barsOf = this.riding && this.held && (this.held === "bike" || this.held === "bmx" || this.held === "scooter") ? this.held : null;
    w.handlebars(w.model.visible && !ride && p.tumble <= 0 ? barsOf : null, this.camera, p.heading, -p.steer * 0.5, p.speed, dt);
    look.dx = look.dy = 0;
    const base = view.fov, gunFov = base - w.aim * (base - (w.gun.zoom ? w.gun.adsFov : base)) + this.rideTricks.fov * (1 - w.aim);
    const fov = gunFov + (BINO_FOV - gunFov) * this.bino;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 20);
      this.camera.updateProjectionMatrix();
    }
    if (tv) {
      const b = this.broadcast;
      this.camera.position.copy(b.pos);
      this.camera.lookAt(b.look);
      this.camera.fov = b.fov;
      this.camera.updateProjectionMatrix();
    }
    const flying = this.reveal.update(dt, this.camera);
    if (flying) w.model.visible = w.radioHand.visible = false;

    this.pickups.update(dt, this.camera);
    if (this.isHost) {
      const changed = this.pickups.host(dt, this.targets().filter((t) => t.alive));
      this.pkT -= dt;
      if (changed || this.pkT <= 0) { this.pkT = PK_EVERY; this.net.send("pk", this.pickups.snapshot()); }
      // anyone gone, or down, drops their ladder where they were
      const lad = this.ladders.host(dt, this.targets());
      for (const [x, z] of lad.drops) this.pickups.place(x, z, "ladder", 90);
      if (lad.drops.length) this.net.send("pk", this.pickups.snapshot());
      this.ldT -= dt;
      if (lad.changed || this.ldT <= 0) this.sendLadders();
    }
    // just stopped being host (someone with a lower id turned up): hand the ladders over
    if (this.ldHost !== this.hostId) {
      if (this.ldHost === this.net.selfId) this.net.send("lds", this.ladders.snapshot(), this.hostId);
      this.ldHost = this.hostId;
    }
    this.ladders.update(dt);
    for (const r of this.remotes.values()) r.avatar.setLadder(r.avatar.alive && this.ladders.carriers.has(r.id));
    this.hintT -= dt;
    if (this.alive) this.grab(); else this.swapAt = null;

    if (this.isHost) {
      this.driveDeliveries(dt);
      if ((this.busT -= dt) <= 0) { this.busT = BUS_EVERY; this.busService(); }
    }
    // vehicles nobody's in, knocked sliding: the host slides them on (knocking into whatever's in the way), anyone else guesses till the host's word comes
    for (const v of this.vehicles.list) if (!v.driver && v.coast > 0 && (this.isHost || now - v.heard > 400)) v.slide(dt, (x, z) => this.world.paved(x, z), this.isHost ? this.shoving(v, v.by) : undefined);
    this.vehicles.update(now, dt, (v) => v === this.car || this.deliveries.has(v), p.pos.x, p.pos.z);
    this.skids.update(dt, this.vehicles.list, p.pos.x, p.pos.z);   // rubber and smoke off any back wheels dragging
    if (ride && !car) this.rideAlong(ride.seat, ride.v);   // keep up with the vehicle as it's drawn this frame
    for (const r of this.remotes.values()) {
      // Sat in a seat, the vehicle draws them and their body's hidden, leaving just the name tag. So
      // only hide it if they say they're in a vehicle too: if a seat's gone stale (their getting out
      // never reached the host, or two pages disagree on who's host or which car is which), they'd
      // walk about as a floating name. And the host gives up a seat they've been out of for a while.
      const seat = this.vehicles.of(r.id);
      r.avatar.seated = !!seat && r.inCar !== false;
      r.carOff = seat && r.inCar === false ? (r.carOff ?? 0) + dt : 0;
      if (seat && r.carOff > 3 && this.isHost) { r.carOff = 0; this.seatPerson(seat.v, seat.seat, ""); this.sendVehicles(); }
      r.avatar.base = r.cab ? this.world.cableway?.cabinAt(r.cab) ?? null : r.bal ? this.balloons.base(r.bal) : null;
      r.avatar.update(now, dt);
      r.avatar.clearOf(this.camera.position, 0.3, this.perchBare ? 1 : 0.3);
    }
    this.drawRides(dt);
    this.engineSounds();
    const at = this.player.pos;
    (this.ambience ??= new Ambience(this.map)).update(dt, at.x, at.y, at.z, (!!this.ride && !this.windowsDown) || this.map.indoors(at.x, at.z) || this.map.inTunnel(at.x, at.z, at.y) !== null);
    this.vsT -= dt;
    if (this.vsT <= 0) {
      this.vsT = 1 / SEND_HZ;
      if (this.car) this.net.send("vs", this.car.state());
      for (const v of this.deliveries.keys()) this.net.send("vs", v.state());
      if (this.isHost) for (const v of this.vehicles.list) if (!v.driver && v.coast > 0) this.net.send("vs", v.state());
    }
    if (this.isHost) { this.vhT -= dt; if (this.vhT <= 0) this.sendVehicles(); }
    const host = this.isHost;
    if (host) this.naughtyBoys.simulate(dt, this.targets(), (i, id, damage) => this.hurt(id, damage, GANG[this.naughtyBoys.at(i)?.kind ?? NAUGHTY], false, this.entry(id).life));
    this.naughtyBoys.update(dt, host);
    this.chT -= dt;
    if (host && this.chT <= 0) { this.chT = 1 / NAUGHTY_HZ; this.net.send("ch", this.naughtyBoys.snapshot()); }
    // a horn sends the calm cats near it running
    if (host) for (const v of this.vehicles.list) if (v.horn) this.cats.scare(v.x, v.z);
    if (host) this.cats.simulate(dt, this.targets(), (_i, id, damage) => this.hurt(id, damage, "cat", false, this.entry(id).life));
    this.cats.update(dt, host, this.camera.position);
    this.ktT -= dt;
    if (host && this.ktT <= 0) { this.ktT = 1 / NAUGHTY_HZ; this.net.send("kt", this.cats.snapshot()); }
    this.clkT -= dt;
    if (host && this.clkT <= 0) { this.clkT = 2; this.net.send("clk", ["set", getSkip()]); }
    if (host) {
      const targets = this.targets();
      this.bendy.simulate(dt, targets, (id, damage) => this.hurt(id, damage, "bendy", false, this.entry(id).life));
      if (this.bendy.due(dt, targets)) this.net.send("bd", this.bendy.snapshot());
    }
    this.bendy.update(dt, host, (id) => this.posOf(id));
    // bloody footprints, but not from anyone at the wheel
    const walkers: Walker[] = this.ride ? [] : [{ id: this.net.selfId, x: p.pos.x, y: p.pos.y, z: p.pos.z, alive: this.alive }];
    for (const r of this.remotes.values()) if (!r.avatar.seated) walkers.push({ id: r.id, x: r.avatar.x, y: r.avatar.y, z: r.avatar.z, alive: r.avatar.alive });
    for (const c of [...this.naughtyBoys.living(), ...this.naughtyBoys.leggingIt()]) walkers.push({ id: c.key, x: c.x, y: c.y, z: c.z, alive: true });
    for (const c of this.cats.living()) walkers.push({ id: c.key, x: c.x, y: c.y, z: c.z, alive: true });
    const bendy = this.bendy.living();
    if (bendy) walkers.push({ id: bendy.key, x: bendy.x, y: bendy.y, z: bendy.z, alive: true });
    this.blood.update(dt, walkers);
    // the traffic: the host drives it round everyone, stopping for people, naughty boys and vehicles in the road
    if (host) {
      const people: Obstacle[] = walkers.filter((w) => w.alive).map((w) => ({ x: w.x, z: w.z, r: 0.4, id: w.id, person: !w.id.includes(".") && this.entry(w.id).alive }));
      for (const v of this.vehicles.list) people.push({ x: v.x, z: v.z, r: v.hl, id: v.driver, person: false, parked: !v.driver && Math.abs(v.speed) < 0.5, a: v.a });
      people.push(...this.breakdown.obstacles(), ...this.quests.obstacles());
      this.traffic.simulate(dt, this.targets(), people, (id, speed) => this.hurt(id, Math.round(speed * 9), "traffic", false, this.entry(id).life, RUN),
        (x, y, z, by) => this.caughtIn(x, y, z, by));
    }
    this.traffic.update(dt, host);
    this.tfT -= dt;
    if (host && this.tfT <= 0) {
      this.tfT = 1 / NAUGHTY_HZ;
      this.net.send("tf", this.traffic.snapshot());
      const wrecks = this.traffic.wrecks();
      if (wrecks.length) this.net.send("tfw", wrecks);
    }
    this.waterways(dt, host, helm);
    this.effects.update(dt);
    // the grass, shadows and detail go where the camera's looking: on the telly, that's the ball
    const focus = this.reveal.on ? this.reveal.look : tv ? this.broadcast.look : p.pos;
    // (the host also loads the streets round everyone else, to run the traffic and the rest there)
    this.world.indoors = this.quests.indoors();
    this.world.update(focus.x, focus.y, focus.z, dt, host ? [...this.remotes.values()].map((r) => ({ x: r.avatar.x, z: r.avatar.z })) : undefined);
    // after dark (or in a tunnel), the traffic and anything being driven have their lights on
    this.lit.length = 0;
    this.traffic.lit(this.lit);
    for (const v of this.vehicles.list) { const l = v.lit; if (l) this.lit.push(l); }
    this.headlights.update(this.lit, this.camera.position, nightNow(), this.world.tunnel, dt);
    this.torches.update(this.camera, this.torchOn && this.alive, [...this.remotes.values()].filter((r) => r.torch && r.avatar.alive && r.avatar.root.visible)
      .map((r) => { const a = r.avatar; return { x: a.x, y: a.y + EYE + (CROUCH_EYE - EYE) * a.crouch + (PRONE_EYE - EYE) * a.prone, z: a.z, yaw: a.yaw, pitch: a.pitch }; }));
    if (!this.active) this.voice.radio(false);   // paused: let go of the radio
    if (this.voice.mode !== this.sentTalk || voiceLevel.code() !== this.sentLevel) this.sendState();   // tell listeners straight away
    for (const r of this.remotes.values()) { r.avatar.talking = this.voice.speaking(r.id); r.avatar.onRadio = this.voice.modeOf(r.id) === 2; }
    const cam = this.camera.position, fwd = this.camera.getWorldDirection(new THREE.Vector3());
    this.voice.update(cam.x, cam.y, cam.z, fwd.x, fwd.y, fwd.z, (id) => this.posOf(id));

    if (!this.alive) {
      this.deadFor += dt;
      // out of a race the others are still riding: back once it's over
      if (this.deadFor >= RESPAWN_SECONDS && !this.quests.waiting()) this.respawn();
    }

    this.sendT -= dt;
    if (this.sendT <= 0) { this.sendT = 1 / SEND_HZ; this.sendState(); }
    if (now - this.spotT > 1000) { this.spotT = now; this.saveSpot(); }
    this.sbT -= dt;
    if (this.sbT <= 0) {
      this.sbT = 2;
      if (this.isHost) this.sendScores();
      else this.hello(this.hostId);   // keeps the host's name list fresh
    }
    this.updateHud(dt);
  }

  /** Steer and kick or bowl, if you're lined up on a ball. */
  private kickAtGoal(dt: number, lining: boolean, filming: boolean) {
    // on the telly: any key or a click (or dying) goes back to your own eyes
    if (filming && (this.anyKey || this.firing || this.shootOnce || !this.alive)) {
      this.broadcast.skip();
      this.firing = this.shootOnce = false;
    }
    this.anyKey = false;
    const p = this.player, k = p.keys, on = this.active && lining;
    const key = (a: string, b: string) => (k.has(a) || k.has(b) ? 1 : 0);
    let turn = key("KeyD", "ArrowRight") - key("KeyA", "ArrowLeft"), power = key("KeyW", "ArrowUp") - key("KeyS", "ArrowDown");
    if (!turn && !power && Math.hypot(p.joy.x, p.joy.y) > 0.15) { turn = p.joy.x; power = -p.joy.y; }
    const kick = this.kickKey || this.firing || this.shootOnce;
    this.sports.tv = filming;
    if (this.sports.keeping && this.alive && this.active && (this.kickKey || this.diveReq)) {
      this.sports.dive(this.diveReq || key("KeyD", "ArrowRight") - key("KeyA", "ArrowLeft"), p);
    }
    this.diveReq = 0;
    this.sports.update(dt * this.broadcast.scale, p, this.alive && !this.ride, on ? { turn, power, kick, leave: this.leaveKey } : { turn: 0, power: 0, kick: false, leave: false }, dt);
    this.broadcast.update(dt, this.sports.shot, (x, z) => this.map.ground(x, z), (a, b) => {
      const d = a.distanceTo(b);
      if (d < 1e-3) return d;
      const hit = this.map.raycast(a.x, a.y, a.z, (b.x - a.x) / d, (b.y - a.y) / d, (b.z - a.z) / d, d);
      return hit && hit.kind !== "ground" ? hit.dist : d;   // walls, stands and trees; it keeps above the ground itself
    });
    // a click while lined up is for the ball, and a held trigger doesn't kick again
    if (lining) { this.firing = false; this.shootOnce = false; }
    this.kickKey = this.leaveKey = false;
  }

  /** Your footsteps, jumps and landings, and other players' footsteps. */
  private footsteps(dt: number) {
    const p = this.player, hard = this.world.paved(p.pos.x, p.pos.z);
    // a foot comes down each time the walk's bob dips (see Player.applyToCamera)
    const n = Math.floor((p.bob - Math.PI * 0.75) / Math.PI);
    if (n !== this.step) {
      this.step = n;
      if (this.alive && p.ladder) SFX.rung();
      else if (this.alive && p.onGround && p.speed > 1) SFX.step(hard, p.crouch > 0.5 ? 0.06 : p.sprinting ? 0.24 : 0.15);
    }
    if (this.alive && p.jumped) SFX.jump(hard);
    if (this.alive && p.diveLanded) SFX.diveThud(hard);
    else if (this.alive && p.landed) SFX.land(hard, Math.min(1, (p.landed - 3) / 12));
    for (const r of this.remotes.values()) {
      const a = r.avatar, moved = Math.hypot(a.x - r.px, a.z - r.pz);
      r.px = a.x; r.pz = a.z;
      if (!a.alive || a.seated || moved > 2 || a.y - this.map.floor(a.x, a.z, a.y) > 0.25) continue;
      r.stride += moved;
      if (r.stride < STRIDE) continue;
      r.stride = 0;
      const [d, pan] = this.hear(a.x, a.y, a.z);
      SFX.step(this.world.paved(a.x, a.z), a.crouch > 0.5 ? 0.05 : moved / dt > 6 ? 0.3 : 0.2, d, pan);
    }
  }

  /** Looking through the sniper's scope. */
  get scoped() { return this.weapon.kind === "sniper" && this.weapon.aim > 0.85; }

  // ---- HUD -----------------------------------------------------------------------------------
  private updateHud(dt: number) {
    const w = this.weapon, p = this.player;
    const now = performance.now();
    const blips: Blip[] = [...this.pickups.items.values()].map((it) => ({ x: it.x, z: it.z, colour: BLIP[it.kind], layer: "pickups" }));
    const coming = this.vehicles.list.find((v) => v.i === this.myBus);
    if (coming?.driver.startsWith("@")) blips.push({ x: coming.x, z: coming.z, colour: "#3fd06a" });
    const ball = this.sports.blip;
    if (ball) blips.push({ x: ball.x, z: ball.z, colour: "#f4f1e8" });
    // other players: an arrow in their colour, ringed red if they've fired in the last two seconds
    const mates: Mate[] = [];
    for (const r of this.remotes.values()) if (r.avatar.alive) mates.push({ x: r.avatar.x, z: r.avatar.z, yaw: r.avatar.yaw, colour: this.mapColour(r.id), name: r.name, firing: now - r.lastShot < 2000 });
    let chased = -1;   // the kind of gang after you, if any
    for (const c of this.naughtyBoys.living()) {
      if (c.target === this.net.selfId && chased < 0 && Math.hypot(c.x - p.pos.x, c.z - p.pos.z) < 60) chased = c.kind;
    }
    // Bendy: a marker of his own on the maps, and his health across the top of the screen while he's near
    const bendy = this.bendy.at(), up = bendy.state === 1, bd = Math.hypot(bendy.x - p.pos.x, bendy.z - p.pos.z);
    this.minimap.boss = this.bendy.living() && bd < 300 ? { x: bendy.x, z: bendy.z, after: !!this.bendy.target } : null;
    const boss = $("boss");
    let bossOff = !(up && (bd < 120 || this.bendy.target === this.net.selfId));
    let bossName = "Bendy", bossFill = (100 * bendy.hp) / BENDY_HP;
    if (bossOff) {
      // or the Chair, or a Wanted ringleader, when you're close
      for (const c of this.naughtyBoys.living()) {
        const at = this.naughtyBoys.at(c.i);
        if (!at || !(at.boss || at.kind === CHAIR) || Math.hypot(c.x - p.pos.x, c.z - p.pos.z) > 90) continue;
        bossName = at.kind === CHAIR ? this.invasion.bossName(at.kit) : this.quests.bossName() || "The ringleader";
        bossFill = (100 * at.hp) / Math.max(1, at.top);
        bossOff = false;
        break;
      }
    }
    const jobBoss = bossOff ? this.quests.bossBar() : null;
    if (jobBoss) { bossName = jobBoss.name; bossFill = 100 * jobBoss.fill; bossOff = false; }
    setHidden(boss, bossOff);
    if (!bossOff) {
      setStyle($("bossfill"), "width", `${bossFill}%`);
      const label = boss.querySelector(".bossname")!;
      say(label, bossName);
    }
    // still standing when the swarm's had its go: a cat for your shoulder
    if (this.furyT > 0 && this.furyT - dt <= 0 && this.alive && this.swarmLife === this.life) earn("cat");
    this.furyT -= dt;
    // the cats after you: how far you've still to run, and when you've got away
    const cf = this.catsFrom;
    if (cf) {
      const on = this.alive && [...this.cats.living()].some((c) => c.target === this.net.selfId);
      const left = Math.ceil(ESCAPE - Math.hypot(p.pos.x - cf.x, p.pos.z - cf.z));
      if (!on) { if (this.alive && left <= 5) this.toast("You got away from the cats", 2); this.catsFrom = null; }
      else if ((cf.t -= dt) <= 0) { cf.t = 1; if (left > 0) this.toast(`Cats after you! Run: ${left} m more`, 1.2); }
    }
    this.chasedT -= dt;
    if (chased >= 0 && this.alive && this.chasedT <= 0) { this.toast(CHASED[chased] ?? CHASED[NAUGHTY], 2.5); SFX.alarm(); }
    if (chased >= 0) this.chasedT = Math.max(this.chasedT, 20);
    this.minimap.jobs = this.quests.spots().concat(this.scars.spots());
    this.minimap.bus = this.busDriver.route();
    if ((this.stopsT -= dt) <= 0) { this.stopsT = 1; this.minimap.stops = this.vehicles.allStops(); }
    this.minimap.circles = this.quests.areas();
    this.minimap.routes = this.quests.routes();
    if (this.mapOpen || !$("bigmap").hidden) this.minimap.tint = this.invasion.tint();
    this.minimap.markers = this.markerList();
    this.markers.update(now / 1000, p.pos.x, p.pos.z);
    const compass = $("compass") as HTMLCanvasElement;
    setHidden(compass, !this.markers.size);
    if (!compass.hidden) drawCompass(compass, p.pos.x, p.pos.z, p.yaw, this.minimap.markers);
    this.minimap.draw(p.pos.x, p.pos.z, p.yaw, blips, mates);
    if (this.mapOpen) this.mapFrame(dt);
    if (!$("bigmap").hidden) this.minimap.drawFull($("bigmapcanvas") as HTMLCanvasElement, p.pos.x, p.pos.z, p.yaw, blips, mates);
    this.watch.update();
    say($("hpnum"), String(Math.ceil(this.hp)));
    $("health").classList.toggle("low", this.alive && this.hp <= 30);
    const fill = $("hpfill");
    setStyle(fill, "width", `${this.hp}%`);
    setStyle(fill, "background", this.hp > 60 ? "var(--ok)" : this.hp > 30 ? "var(--accent)" : "var(--danger)");
    const gun = w.gun, fists = w.kind === "fists", sniper = w.kind === "sniper";
    say($("ammolabel"), ammoLabel(w.kind));
    say($("ammonum"), fists ? "–" : String(w.rounds));
    say($("ammomax"), fists ? "" : `/ ${sniper ? w.sniperReserve : w.reserve}`);
    setStyle($("magfill"), "width", fists ? "0%" : `${(w.rounds / gun.mag) * 100}%`);
    setStyle($("ammo"), "--segs", String(gun.mag || 1));
    $("ammo").classList.toggle("low", !fists && w.rounds <= (sniper ? 2 : 6));
    say($("reloadmsg"), ctlText(fists ? (w.has("rifle") ? "Press {rifle} for the rifle" : w.has("sniper") ? "Press {sniper} for the sniper" : "Out of ammo: find some rounds")
      : sniper ? (w.reloading > 0 ? "Reloading…" : w.sniperAmmo === 0 ? (w.sniperReserve ? "Press {reload} to reload" : "Out of sniper rounds")
        : w.rechambering ? "Working the bolt…" : w.sniperAmmo === 1 ? "Last round" : w.sniperAmmo === 2 ? "2 rounds left" : "")
      : w.reloading > 0 ? "Reloading…" : w.ammo === 0 ? (w.reserve ? "Press {reload} to reload" : "Out of ammo")
      : w.ammo <= 6 ? "Low ammo" : w.reserve === 0 ? "No spare rounds" : ""));
    setHidden($("scope"), !this.scoped || !this.alive);
    setHidden($("binoculars"), this.bino < 0.85 || !this.alive);
    $("t-bino").classList.toggle("latched", this.binoculars);
    $("t-aim").classList.toggle("latched", this.aiming);
    $("t-crouch").classList.toggle("latched", p.crouchLatch || p.proneLatch);
    const crouchText = p.proneLatch ? "Tummy" : "Crouch";
    say($("t-crouch"), crouchText);
    const gap = 4 + w.spread(Math.min(1, p.speed / 5), !p.onGround) * 700;
    const ch = $("crosshair");
    setStyle(ch, "--gap", `${gap.toFixed(1)}px`);
    setStyle(ch, "opacity", w.aim > 0.6 || this.bino > 0.3 || p.sprinting || !this.alive || this.sports.lining || this.car ? "0" : "1");
    // aiming the paintball marker: its red dot, square in the middle where the paint goes
    setHidden($("reddot"), !(w.kind === "rifle" && !gore() && w.aim > 0.6 && w.model.visible));
    this.driveHud();
    const lining = this.sports.lining;
    setHidden($("kick"), !lining);
    if (lining) {
      const pw = this.sports.power;
      setStyle($("kickfill"), "width", `${Math.round(pw * 100)}%`);
      setStyle($("kickfill"), "background", `hsl(${Math.round((1 - pw) * 120)}, 85%, 50%)`);
      const bowl = this.sports.sport === "c";
      say($("kicklabel"), bowl ? "Bowling · pace" : "Kick at goal · power");
      // the wind: which way it's blowing, from where you're facing (up the screen is straight ahead)
      const wind = this.sports.wind, mph = wind ? Math.round(wind.length() * 2.237) : 0, flag = this.sports.flagOnly;
      say($("wind"), flag ? "Read the wind from the corner flag" : mph ? `Wind ${mph} mph` : "No wind");
      setHidden($("windarrow"), !mph || flag);
      if (wind && mph) {
        const yaw = p.yaw, ahead = -wind.x * Math.sin(yaw) - wind.z * Math.cos(yaw), right = wind.x * Math.cos(yaw) - wind.z * Math.sin(yaw);
        setStyle($("windarrow"), "transform", `rotate(${Math.atan2(right, ahead)}rad)`);
      }
      show($("kickhint"), stripOf([["steer", "aim"], ["throttle", bowl ? "pace" : "power"], ["kick", bowl ? "bowl" : "kick"], ["walkoff", "walk off"]]));
    }
    this.shootCard();
    $("hud").classList.toggle("tv", this.broadcast.on);
    if (this.broadcast.on) say($("caption"), this.broadcast.caption);
    setHidden($("boost"), (this.boostT <= 0 && this.smokeT <= 0) || !this.alive);
    if (this.smokeT > 0) say($("boost"), `Jamie's ciggie: can't be hurt, double damage ${Math.ceil(this.smokeT)}s`);
    else if (this.boostT > 0) say($("boost"), `Lucozade: double damage ${Math.ceil(this.boostT)}s`);
    this.hitT -= dt;
    setStyle($("hitmarker"), "opacity", this.hitT > 0 ? "1" : "0");
    this.hurtT -= dt;
    // smoking one of Jamie's: the red creeps in round the edges, throbbing
    const rage = this.smokeT > 0 && this.alive ? 0.28 + 0.12 * Math.sin(now / 1000 * 5) : 0;
    setStyle($("vignette"), "opacity", String(Math.max(0, this.hurtT * 2, this.hp < 35 && this.alive ? 0.35 : 0, rage)));
    const death = $("death");
    // out of a race and watching the others, the race's own banner says so instead
    setHidden(death, this.alive || this.quests.waiting());
    if (!death.hidden) {
      say($("deathby"), this.killer);
      say($("deathcount"), `Respawn in ${Math.max(1, Math.ceil(RESPAWN_SECONDS - this.deadFor))}…`);
    }
    const n = this.remotes.size + 1, where = mapName(this.mapId);
    say($("roominfo"), this.net.kind === "local" && this.room === "SOLO"
      ? `Practice · ${where} · on your own`
      : `Room ${this.room} · ${where} · ${n} player${n === 1 ? "" : "s"}${this.isHost ? " · you're hosting" : ""}`);
    this.renderTalkers();
    this.toastT -= dt;
    $("toast").classList.toggle("show", this.toastT > 0);
    this.placeT -= dt;
    if (this.placeT <= 0) {
      this.placeT = 0.5;
      // on a street: its name; off the streets: the place you're in; otherwise the nearest street
      let best = "", bd = 30;
      for (const s of this.streets) {
        const d = Math.hypot(s.x - p.pos.x, s.z - p.pos.z);
        if (d < bd) { bd = d; best = s.n; }
      }
      if (bd > 10) best = this.placeAt(p.pos.x, -p.pos.z)?.n ?? best;
      const edge = this.map.fieldEdge(p.pos.x, p.pos.z), aloft = this.quests.aloft();
      const where = $("where");
      say(where, aloft ? "" : edge < 25 ? "Force field: you can't go further" : best);
      where.classList.toggle("warn", !aloft && edge < 25);
      $("hud").classList.toggle("aloft", aloft);
    }
  }

  /** The vehicle you're driving and how fast, or the prompt to get in one. */
  private driveHud() {
    const car = this.car, ride = this.ride, canal = this.world.canal, me = this.net.selfId;
    const helm = canal?.helmOf(me) ?? null;
    const sky = this.balloons.gauges(), flying = !!this.balloons.flying;
    setHidden($("drive"), !car && !helm && !sky);
    setHidden($("ammo"), !!car || !!helm || !!sky);
    say($("drive").querySelector("small")!, sky ? "m up" : "mph");
    if (!car) setHidden($("limit"), true);
    if (sky) {
      const b = this.balloons.mine!, arrow = sky.climb > 0.2 ? "▲" : sky.climb < -0.2 ? "▼" : "◆";
      say($("drivename"), `${b.name} · ${arrow} ${Math.abs(sky.climb).toFixed(1)} m/s · ${sky.temp}°C`);
      say($("mph"), String(sky.up));
      const out = this.balloons.clearance() <= 3;
      show($("drivehint"), !flying ? (out ? stripOf([["use", "get out"]]) : "Along for the ride")
        : stripOf([["burner", "burner"], ["vent", "vent"], ["steer", "turn"], ...(out ? [["use", "get out"] as [string, string]] : [])]));
    }
    if (helm) {
      say($("drivename"), `${helm.name}, narrowboat`);
      say($("mph"), String(Math.round(Math.abs(helm.v) * 2.237)));
      show($("drivehint"), stripOf([["throttle", "throttle"], ["steer", "tiller"], ["horn", "bell"], ["left", ""], ["right", "wave"], ["view", "view"], ["out", "let go"]]));
    }
    if (car) {
      const horn = car.kind === "police" ? "siren" : car.kind === "icecream" ? "chimes" : "horn";
      const blink = performance.now() % 760 < 380;
      say($("drivename"), (car.signal > 0 && blink ? "◀ " : "") + car.name + (car.signal < 0 && blink ? " ▶" : ""));
      say($("mph"), String(Math.round(Math.abs(car.speed) * 2.237)));
      const lim = limitShown(this.map, car.x, car.z, Math.cos(car.a), -Math.sin(car.a));
      show($("limit"), lim ? String(lim) : "", !!lim);
      show($("drivehint"), car.tip ? stripOf([["out", "get out"]])
        : stripOf([["drive", "drive"], ["brake", "brake"], ["steer", "steer"], ["left", ""], ["right", "indicate"], ["handbrake", "handbrake"], ["horn", horn], ["view", "view"], ["out", "out"]]));
    }
    const free = !ride && this.alive && !this.sports.lining && !this.broadcast.on;
    const tape = free && !this.car ? this.golfDriver.hint() : "";
    const near = free && !tape ? this.nearCar() : null, stop = free && !near && !tape ? this.stopNear() : null;
    const tour = !ride && this.alive && this.mineTour.near(this.player.pos.x, this.player.pos.z, this.player.pos.y);
    const deli = !ride && this.alive && !tour && this.deliDoor.near(this.player.pos.x, this.player.pos.z, this.player.pos.y);
    if (stop !== this.busStop) this.busMenu = 0;   // walked off: the menu goes
    const menu = !!stop && this.busMenu > performance.now();
    const verb = near?.t !== undefined ? "Nick" : near?.driver ? "Ride in" : "Get in";
    const pp = this.player.pos;
    const tiller = free && !near && !helm && canal ? canal.tillerNear(pp.x, pp.y, pp.z, me) : null;
    const moored = free && !near && !helm && !tiller && canal ? canal.mooredNear(pp.x, pp.y, pp.z) : -1;
    const lock = free && !near && !helm && !tiller && moored < 0 && canal ? canal.lockNear(pp.x, pp.z) : -1;
    const job = !ride && !tour && !deli ? this.quests.hint() || (!this.car ? this.invasion.hint() || this.scars.hint() : "") : "";
    // by a balloon's basket on the lawn (or wherever one's come down)
    const balloon = free && !near && !this.basket && !this.riding ? this.balloons.near(this.player.pos.x, this.player.pos.y, this.player.pos.z) : null;
    // something new in your hands: say what to do with it, for a moment
    const slotNow = this.carrying();
    if (slotNow !== this.tipSlot) { this.tipSlot = slotNow; if (slotNow) this.rideTip = performance.now() + TIP_MS; }
    const ladder = !ride && !this.riding && this.alive ? this.ladderHint() : "";
    const wood = !ride && !car && !tour && !deli && this.alive ? this.oddments.hint(this.woodMe()) || this.bonfire.hint(this.woodMe()) : "";
      // at a train's open door: say where it goes and get on with E. Away from a door there's
      // nothing to say, and E there does nothing.
      const door = !ride && !near && !tour && !deli && this.alive ? this.atTrainDoor() : null;
      const doorLink = door ? this.world.railway!.linkFor(door) : null;
      const train = door && doorLink ? `<b>{use}</b> Board the ${esc(doorLink.to_station)} train` : "";
    // stood on a station platform with no train to get on: the next one from this platform, as the board says
    const wait = !door && !ride && !car && !this.riding && this.alive ? this.platformHint() : "";
    const slot = this.carrying(), sw = !ride && this.alive ? this.swapAt?.kind : undefined;
    const named = (k: RideKind | "ladder" | "odd") => (k === "ladder" ? "the ladder" : k === "odd" ? "the strange thing" : esc(rideSpecs[k].name));
    const swap = sw && slot && (isRide(sw) || sw === "ladder") ? `Swap ${named(slot).replace(/^(an?|the) /, "your ")} for ${named(sw)}` : "";
    const text = tour ? `<b>{use}</b> Go in for a mine tour`
      : deli ? `<b>{use}</b> Work a shift in the deli kitchen`
      : train ? train
      : job ? job
      : tape ? tape
      : near ? `<b>{use}</b> ${verb} the ${esc(near.name)}`
      : balloon ? (balloon.why ? esc(balloon.why) : `<b>{use}</b> Climb into ${esc(balloon.b.name)}'s basket`)
      : tiller ? (this.zones.can("boat") ? `<b>{use}</b> Take the tiller of ${esc(tiller.name)}` : esc(this.zones.shut("boat")))
      : moored >= 0 ? (this.zones.can("boat") ? `<b>{use}</b> Cast off ${esc(canal!.mooredName(moored))} and take the tiller` : esc(this.zones.shut("boat")))
      : lock >= 0 ? `<b>{use}</b> ${esc(canal!.lockHint(lock))}`
      : menu ? `<button data-bus="minibus"><b>{minibus}</b> Minibus</button> <button data-bus="bus"><b>{bus}</b> Double-decker</button>`
      : stop ? (this.zones.can("bus") ? `<b>{use}</b> Call a bus` : esc(this.zones.shut("bus")))
      : ride && !car ? `Riding in the ${esc(ride.v.name)} · <b>{use}</b> to get out`
      : this.basket ? `In the trolley · <b>{use}</b> to climb out`
      : swap ? `<b>{use}</b> ${swap}`
      : this.riding && this.held && performance.now() < this.rideTip ? `On ${esc(rideSpecs[this.held].name)} · <b>{ride}</b> to get off${` · ${esc(rideSpecs[this.held].keys)}`}`
      : this.held && performance.now() < this.rideTip ? `<b>{ride}</b> Get on ${esc(rideSpecs[this.held].name)}`
      : wood && !ladder.startsWith("<b>") ? wood
      : ladder || wait;
    // in a race's countdown the prompt waits too, and what to do with the ride is said once it's over
    // and call-outs wait for a mission's title card too, which has the space where they'd go
    const hush = this.quests.quiet(), calm = hush || missionCardUp();
    if (this.hushed && !hush && this.riding) this.rideTip = performance.now() + TIP_MS;
    if (calm && !this.calmed && this.toastT > 0) { this.heldToast = { text: $("toast").textContent ?? "", secs: Math.max(1.5, this.toastT) }; this.toastT = 0; }
    if (!calm && this.heldToast) {
      const held = this.heldToast;
      this.heldToast = null;
      this.toast(held.text, held.secs);
    }
    this.hushed = hush;
    this.calmed = calm;
    // a results card in the middle: the prompt waits, and a tip about a ride just won waits for it to go
    const results = !!document.querySelector(".rsc-end:not(.out)");
    if (results && this.rideTip > performance.now()) this.rideTip = performance.now() + TIP_MS;
    const quietNow = hush || results;
    show($("usehint"), quietNow ? "" : ctlText(text), !quietNow && !!text);
    // the one thing you carry (a ride or a ladder), all the time, with its icon, over your rounds
    // (the middle of the screen only says what to do with it for a moment: the keys stay here, small)
    const lad = !this.held && this.alive && this.ladders.carriers.has(me);
    const what = this.held ? esc(rideSpecs[this.held].name.replace(/^an? /, "")) : "";
    const rk = "{ride}";
    const logs = !this.held && !lad && this.alive && this.bonfire.carrying(me);
    const odd = !this.held && !lad && this.alive && this.oddments.carrying(me);
    const words = odd ? `Carrying something strange<small><b>${rk}</b> to put it down</small>`
      : lad ? `Got: ladder<small><b>${rk}</b> facing a wall to put it up</small>`
      : logs ? "Got: firewood<small>Take it to the bonfire, on the court by Fonthill Road</small>"
      : !this.held ? "" : this.riding ? `Riding: ${what}<small><b>${rk}</b> to get off</small>` : `Got: ${what}<small><b>${rk}</b> to get on</small>`;
    const chip = !words ? "" : `<span class="carryicon">${carryIcon(odd ? "odd" : lad ? "ladder" : logs ? "wood" : this.held!)}</span><span class="carrywords">${words}</span>`;
    show($("ridechip"), ctlText(chip), !!chip);
    const jobUse = job.includes("<b>{use}</b>") || job.includes("<b>{again}</b>");
    const ladderUse = ladder.startsWith("<b>{use}</b>");
    const woodUse = wood.startsWith("<b>{use}</b>") && !ladderUse;
    const balloonUse = (!!balloon && !balloon.why) || (!!sky && this.balloons.clearance() <= 3);
    const goal = this.sports.goalCall;
    setHidden($("t-car"), !goal && !ride && !near && !tour && !deli && !train && !stop && !helm && !tiller && lock < 0 && !jobUse && !ladderUse && !woodUse && !swap && !balloonUse);
    setHidden($("t-ride"), (!this.held && !lad && !odd) || !!ride || !!this.basket);
    setHidden($("t-view"), !this.car && !this.world.canal?.helmOf(this.net.selfId));
    for (const id of ["t-sigl", "t-sigr"]) setHidden($(id), !this.car && !this.world.canal?.helmOf(this.net.selfId));
    say($("t-ride"), this.riding ? "Get off" : lad ? "Put up" : odd ? "Put down" : "Ride");
    setHidden($("t-trick"), !this.riding || !!ride || !this.held || !rideSpecs[this.held].grind);
    say($("t-car"), ride || sky ? "Get out" : helm ? "Let go" : balloonUse ? "Get in" : tour || deli ? "Go in" : train ? "Board" : jobUse || goal ? "Use" : near ? "Get in" : swap && !stop ? "Swap" : woodUse && !stop ? (wood.includes("Set it") ? "Set it in" : "Pick up") : tiller || lock >= 0 || (ladderUse && !stop) ? "Use" : "Bus");
  }

  /** The score card of a set of penalties or a shoot-out, and the keeper's dive buttons. */
  private shootCard() {
    const c = this.sports.card;
    if (c !== this.cardShown) {
      this.cardShown = c;
      show($("shootcard"), c ? `<b>${esc(c.score)}</b><em>${esc(c.turn)}</em>` : "", !!c);
    }
    const dives = !!c && c.role === "keeper" && this.alive;
    setHidden($("t-dl"), !dives); setHidden($("t-dr"), !dives);
    if (dives) say($("shoothint"), input() === "touch" ? "You're in goal: tap a Dive button" : ctlText("You're in goal: hold {steer} to one side and press {dive} to dive"));
    setHidden($("shoothint"), !dives);
  }

  /** What there is to do with a ladder here: on one, by the foot of one, or carrying one. */
  private ladderHint(): string {
    const p = this.player, use = "{use}", put = "{ride}";
    if (p.ladder) return `On the ladder · ${stripOf([["climbup", "to climb"], ["climbdown", "to go down"], ["letgo", "to let go"]])}`;
    if (this.ladders.carriers.has(this.net.selfId)) {
      // where it would go is worth working out only a few times a second
      if ((this.aimT -= 1) <= 0) {
        this.aimT = 10;
        const at = p.onGround ? this.ladders.aim(p.pos.x, p.pos.y, p.pos.z, p.yaw) : "";
        this.aimText = typeof at === "string" ? (performance.now() < this.rideTip ? "Got a ladder: face the wall of a building to put it up" : "")
          : `<b>${put}</b> Put the ladder up to the roof (${Math.round(at.y1 - at.y0)} m)`;
      }
      return this.aimText;
    }
    const L = this.ladders.footAt(p.pos.x, p.pos.y, p.pos.z) ?? this.ladders.topAt(p.pos.x, p.pos.y, p.pos.z);
    return L ? `<b>${use}</b> Take the ladder down · walk into it to climb` : "";
  }
  private aimT = 0;
  private aimText = "";

  /** Who's talking: you, anyone on the radio, and anyone close enough to hear. */
  private renderTalkers() {
    const v = this.voice, p = this.player.pos;
    const rows: string[] = [];
    if (v.mode === 2) rows.push(`<div class="radio"><b>You're</b> on the radio</div>`);
    for (const r of this.remotes.values()) {
      if (!v.speaking(r.id)) continue;
      if (v.modeOf(r.id) === 2) rows.push(`<div class="radio"><b style="color:${r.colour}">${esc(r.name)}</b> on the radio</div>`);
      else if (v.inRange(Math.hypot(r.avatar.x - p.x, r.avatar.y - p.y, r.avatar.z - p.z))) rows.push(`<div><b style="color:${r.colour}">${esc(r.name)}</b> nearby</div>`);
    }
    const html = rows.join("");
    show($("talkers"), html);
  }

  /** Today's jobs: up for a while when you join, then under Tab (and on the pause screen); and the
   *  metres you ride, for the one that counts them. */
  private updateDaily() {
    const p = this.player;
    if (this.riding && this.alive && !this.car && !this.ride) {
      if (this.rideFrom) {
        const d = Math.hypot(p.pos.x - this.rideFrom.x, p.pos.z - this.rideFrom.z);
        if (d < 5) { noteDaily("ride", d); if (this.held) Trophies.ride(this.held, d); }   // a jump to a start line or a respawn doesn't count
      }
      this.rideFrom = { x: p.pos.x, z: p.pos.z };
    } else this.rideFrom = null;
    const board = $("scoreboard");
    // by the clock rather than frames, so a slow machine doesn't keep it up for longer
    if (this.dailyT < 0 && this.active) { this.dailyT = performance.now() + (this.joinNews ? 20000 : 12000); board.classList.add("join"); board.hidden = false; }
    if (this.dailyT > 0 && (performance.now() > this.dailyT || !$("pause").hidden)) { this.dailyT = 0; board.hidden = true; board.classList.remove("join"); }
    if (!board.hidden) this.daily.draw($("daily"));
    this.drawDaily();
  }

  /** Put away the paper you get on joining (at the next frame). */
  putAwayDaily() { if (this.dailyT > 0) this.dailyT = performance.now(); }

  /** The Chronicle's own sheet over the pause menu, if it's open. */
  drawDaily() { if (!$("chronicle").hidden) this.daily.draw($("chrondaily")); }

  /** Open the Chronicle over the pause screen, with yesterday's news written afresh. */
  readChronicle() {
    this.daily.refresh();
    $("chronicle").hidden = false;
    this.drawDaily();
    $("chronicle").scrollTop = 0;
  }

  private renderScores() {
    const rows = Object.entries(this.scores).sort((a, b) => b[1].k - a[1].k || a[1].d - b[1].d);
    $("scores").innerHTML = rows.map(([id, s]) =>
      `<tr class="${id === this.net.selfId ? "me" : ""}"><td>${esc(id === this.net.selfId ? this.name : s.name)}</td><td>${s.k}</td><td>${s.d}</td><td>${s.c ?? 0}</td></tr>`).join("");
  }

  /** Someone joining or leaving: a notice in the middle of the screen, above the street sign. */
  notice(html: string, joined: boolean) {
    const el = document.createElement("div");
    el.innerHTML = html;
    el.className = joined ? "in" : "out";
    const f = $("notices");
    f.append(el);
    while (f.children.length > 3) f.firstChild!.remove();
    setTimeout(() => el.remove(), 4500);
  }

  feed(html: string) {
    const el = document.createElement("div");
    el.innerHTML = html;
    const f = $("feed");
    f.prepend(el);
    while (f.children.length > 5) f.lastChild!.remove();
    setTimeout(() => el.remove(), 7000);
  }

  /** Jamie's given you a cigarette (jamie.ts): smoke it, and for a minute nothing can hurt you and every hit does double. */
  private lightUp() {
    this.smokeT = SMOKE;
    this.jamieRest = SMOKE + JAMIE_REST;
    SFX.pickup("smoke");
    this.toast(`Jamie's ciggie: nothing can hurt you, double damage, ${SMOKE} seconds`, 3.5);
    this.sendState();   // so the host knows straight away
  }

  /** What a prompt calls a key: its touch button on a touch screen, else the key or the pad's button. */

  toast(text: string, secs = 2) {
    // a race's countdown has the middle of the screen: the call-out comes once GO has gone
    if (this.quests.quiet() || missionCardUp()) { this.heldToast = { text, secs }; return; }
    text = ctlText(this.freeMode ? text : padText(text));
    const el = $("toast");
    if (this.toastT <= 0 || el.textContent !== text) pop(el);   // a new call-out springs in (pop.ts)
    el.textContent = text;
    this.toastT = secs;
    // the panel of today's jobs you get on joining sits behind the toast: a toast puts it away
    if (this.dailyT > 0) { this.dailyT = 0; $("scoreboard").hidden = true; $("scoreboard").classList.remove("join"); }
  }

  /** What the jobs (quests.ts) can see of the game and do in it. */
  private questWorld(): QuestWorld {
    const g = this;
    return {
      map: this.map, scene: this.world.scene, naughtyBoys: this.naughtyBoys,
      get selfId() { return g.net.selfId; },
      get name() { return g.name; },
      get isHost() { return g.isHost; },
      get passive() { return g.passive; },
      me: () => { const p = this.player.pos; return { x: p.x, y: p.y, z: p.z, yaw: this.player.yaw, alive: this.alive }; },
      players: () => [
        { id: this.net.selfId, name: this.name, colour: YOUR_ARROW, x: this.player.pos.x, y: this.player.pos.y, z: this.player.pos.z, alive: this.alive },
        ...[...this.remotes.values()].map((r) => ({ id: r.id, name: r.name, colour: r.colour, x: r.avatar.x, y: r.avatar.y, z: r.avatar.z, alive: r.avatar.alive })),
      ],
      nameOf: (id) => (id === this.net.selfId ? this.name : this.remotes.get(id)?.name ?? this.scores[id]?.name ?? "Someone"),
      colourOf: (id) => (id === this.net.selfId ? "#e3a33b" : colourFor(id)),
      pubs: () => this.pubList.filter((q) => this.map.fieldEdge(q.x, q.z) > 1).map((q) => ({ name: q.name, x: q.x, z: q.z, rating: q.rating })),
      places: () => {
        const out: { n: string; x: number; z: number }[] = [];
        for (const p of [...this.map.d.pl ?? [], ...this.map.wide?.d.pl ?? []]) {
          if (!p.n || p.r.length < 3) continue;
          const [x, z] = this.map.offKept(p.r.reduce((s, q) => s + q[0], 0) / p.r.length, -p.r.reduce((s, q) => s + q[1], 0) / p.r.length);
          if (this.map.fieldEdge(x, z) < 20) continue;
          if (!out.some((o) => o.n === p.n && Math.hypot(o.x - x, o.z - z) < 150)) out.push({ n: p.n, x, z });
        }
        return out;
      },
      send: (type, data, to) => this.net.send(type, data, to),
      toast: (text, secs) => this.toast(text, secs),
      feed: (html) => this.feed(html),
      mark: (id, at, label = "", colour = "#ffd84a") => {
        if (!at) { this.markers.clear(id); this.marks.delete(id); return; }
        this.markers.set(id, at.x, at.y ?? this.map.ground(at.x, at.z), at.z, colour);
        this.marks.set(id, { label, colour });
      },
      prize: (x, z, good) => { this.pickups.bonus(x, z, good); this.net.send("pk", this.pickups.snapshot()); },
      look: () => {
        const c = this.camera.position, d = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
        return { x: c.x, y: c.y, z: c.z, dx: d.x, dy: d.y, dz: d.z, zoomed: this.binoculars || (this.aiming && this.weapon.kind !== "fists") };
      },
      circle: (key, c) => this.quests.circle(key, c),
      ride: (kind) => { this.giveRide(kind); if (!this.riding) this.toggleRide(); },
      reward: (what) => { if ((RIDES as readonly string[]).includes(what)) this.giveRide(what as RideKind); },
      announce: () => this.hello(),
      moveTo: (x, z, yaw) => {
        if (this.ride) this.getOut();
        this.letGo();
        this.carrier = null;
        this.player.spawn(x, z, yaw);
        this.sendState();
      },
      riding: () => (this.riding && this.alive ? this.held : null),
      slow: (secs) => { this.slowT = Math.max(this.slowT, secs); },
      rideBoost: (mul, kick = 0) => { this.rideMulT = 0.25; this.rideMulV = mul; this.player.rideKick += kick; },
      knock: () => this.player.knock(),
      hear: (x, y, z) => this.hear(x, y, z),
      dust: (x, y, z, nx, nz) => { if (Math.hypot(x - this.camera.position.x, z - this.camera.position.z) < 80) this.effects.dust(new THREE.Vector3(x, y, z), new THREE.Vector3(nx, 0, nz)); },
      manual: () => (this.riding && this.alive ? this.player.manual : 0),
      pencil: (key, pts) => this.setTrailLine(key, pts),
      wipe: () => this.setTrailLine(null, null),
      body: () => this.player,
      stick: () => ({ x: this.player.joy.x, y: this.player.joy.y }),
      pose: (id, lean, arms) => { const r = this.remotes.get(id); if (r) { r.avatar.lean = lean; r.avatar.hold = arms; } },
      vehicle: (i, kind, paint, x, z, a, label) => this.vehicles.own(i, kind, paint, x, z, a, label),
      dropVehicle: (v) => {
        if (this.ride?.v === v) this.getOut();
        if (this.askedCar === v.i) this.askedCar = -1;
        this.vehicles.remove(v);
      },
      seated: () => (this.ride ? { v: this.ride.v, seat: this.ride.seat } : null),
      getOut: () => this.getOut(),
      windows: (open) => { this.windowsDown = open; },
      pavement: (x, z) => this.world.pavement(x, z),
      voice: (id) => decodeLevel(id === this.net.selfId ? voiceLevel.code() : this.remotes.get(id)?.level ?? 0),
      shove: (v) => this.shoving(v, this.net.selfId),
      runOver: (v) => {
        this.runOver(v);
        // runOver claims everyone else; the host's own body is claimed here, as a crash of its own
        const p = this.player.pos, key = `${this.net.selfId}.${this.life}`, now = performance.now();
        if (!this.alive || this.ride || v.distance(p.x, p.z) > 0.5 || Math.abs(p.y - v.y) > 2 || now - (this.runT.get(key) ?? -1e9) < 1500) return;
        this.runT.set(key, now);
        this.thud(v);
        this.applyCrash(this.net.selfId, { life: this.life, dmg: Math.min(80, Math.abs(v.speed) * v.spec.mass * 8) });
      },
    };
  }

  /** leave: true (the default) also drops the connection, for closing the game. Travelling passes
   *  false: only this map's world is torn down, and the voice links and the room stay. */
  dispose(leave = true) {
    this.unEarn();
    this.wings.dispose();
    this.records.dispose();
    this.golfDriver.dispose();
    this.reveal.dispose();
    this.zones.dispose();
    this.oddments.dispose();
    this.balloons.dispose();
    this.quests.dispose();
    this.scars.dispose();
    this.invasion.dispose();
    this.night.dispose();
    this.daily.dispose();
    this.stopTrophies();
    Quips.hush();
    for (const e of this.engines.values()) e.stop();
    for (const e of this.trainEngines.values()) e.stop();
    for (const r of this.rushes.values()) r.stop();
    this.ambience?.stop();
    const M = this.map.movers;
    for (const m of this.solid) { const k = M.indexOf(m); if (k >= 0) M.splice(k, 1); }
    if (leave) { this.voice.dispose(); this.net.leave(); }
    for (const r of this.remotes.values()) this.world.scene.remove(r.avatar.root);
    this.listeners.abort();   // and drop this game's key and mouse listeners (travelling starts another)
  }
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
