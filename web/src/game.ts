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
//   connection, voice links and match state, starting on the arrival station's platform. Each map
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
// - Going to a pub from the pause menu's pub map (pubmap.ts, goTo) just moves you there: like any move, it goes out in
//   your next position update, and everyone else sees you vanish and turn up outside the pub. You come
//   back to life outside the last pub you went to, which is your own business too.
// - The canal (canal.ts): the host runs its locks and boats and sends them round; working a lock, taking a
//   tiller and the throttle you set go to the host. The trains (railway.ts) run to the clock, so nobody
//   sends them; anyone a train hits says so to the host, which takes it as a kill by "train".
// - The cable car (cableway.ts) runs to the clock as well, so nobody sends it either.
// - Standing on a boat or a train's roof, or riding a cable car cabin, you're carried along with it, on
//   your own screen like any move.
// - Map markers (markers.ts): each player sets their own and sends it to everyone, and to anyone who joins.
// - Rides (rides.ts): you ride yourself, like walking, and say what you're on in your position updates. A hard
//   crash into a wall you tell the host about, as with a train, and it takes it as damage. Tricks and their
//   score (ridetricks.ts) are yours alone.
// - Jobs (quests.ts): today's noticeboards come from the clock; whoever takes a job sends it round, and the
//   host tells anyone joining what job is on. The host runs whatever a job needs (a Wanted man's crew).
// - The Flag Lads (invasion.ts): where it starts each day comes from the clock; the host runs the
//   spreading, the call-outs and its crews, and sends how it stands ("bv"). Whoever shoots a flag down says so.
import * as THREE from "three";
import * as SFX from "./audio";
import { urlSpot } from "./debug";
import { MineTour } from "./minetour";
import { DeliDoor } from "./delidoor";
import { Breakdown } from "./breakdown";
import { Avatar, colourFor } from "./avatar";
import { Blood, OnBody, onBody, Walker } from "./blood";
import { Skids } from "./skids";
import { Headlights, Lit } from "./headlights";
import { Torches } from "./torch";
import { clockLink, getSkip, nightNow, setSkip } from "./daylight";
import { gore, listenForCheat, paintFor, watch } from "./gore";
import { Broadcast } from "./broadcast";
import { show, say } from "./show";
import { Ladders } from "./ladders";
import { carryIcon } from "./carryicons";
import { CHAIR, LADDER, NAUGHTY, NaughtyBoyState, NaughtyBoys, Target } from "./naughtyboys";
import { Invasion } from "./invasion";
import { Daily, note as noteDaily } from "./daily";
import { CatState, Cats, ESCAPE } from "./cats";
import { BENDY_HP, Bendy, BendyState } from "./bendy";
import { clearSpot } from "./haunts";
import * as Posh from "./posh";
import { GameMap, Mover, PATHS, Place, RayHit } from "./map";
import { DEFAULT_MAP, mapName } from "./maps";
import { Net } from "./net";
import { Minimap, Pin, type Blip, type Mate } from "./minimap";
import { MapKey } from "./mapkey";
import { drawCompass, Markers } from "./markers";
import { BLIP, AMMO_PICKUP, BOOST_SECONDS, Kind, PINT_HEAL, Pickups, SNIPER_PICKUP, isRide, type Item } from "./pickups";
import { Player, EYE, CROUCH_EYE, PRONE_EYE } from "./player";
import { Quests, type QuestWorld } from "./quests";
import "./wanted";
import { myRosettes } from "./trail";
import "./race";
import "./gulls";
import "./stunts";
import "./climb";
import { abbeyLadders } from "./abbeyclimb";
import { Wings } from "./wings";
import { IN_TROLLEY, RIDES, RideView, TROLLEY_AHEAD, rideCode, rideOf, rideSpecs, type RideKind } from "./rides";
import { RideTricks } from "./ridetricks";
import * as Quips from "./quips";
import { Sports } from "./sport";
import { isStartup, Loose, Shove, Stop, Vehicle, Vehicles, VKind } from "./vehicles";
import { CAR_MASS, KNOCK, Obstacle, Traffic, TRAFFIC_ID } from "./traffic";
import { view } from "./view";
import { passive as myPassive } from "./settings";
import { Voice } from "./voice";
import { ammoLabel, damage, Effects, type Follow, follow, GunKind, GUNS, MAX_RESERVE, SLOTS, SNIPER_MAX_RESERVE, Weapon } from "./weapon";
import { World } from "./world";
import { count as wardCount, earn, myWear, onEarn } from "./wardrobe";

const RESPAWN_SECONDS = 3;
const YOUR_ARROW = "#ffdd00";    // you, in yellow, like your arrow on the map
const MARK_RANGE = 1500;        // metres: how far away G can put a marker
const SEND_HZ = 20;
const NAUGHTY_HZ = 10;
/** Who hit you, when it was a naughty boy, the rugby team or the cricket team: by kind (see naughtyboys.ts). */
const GANG = ["naughtyBoy", "rugby", "cricket", "society", "ladder", "chair"];
/** What to call them, and how they finish you off. */
const GANG_NAME: Record<string, string> = { naughtyBoy: "A naughty boy", rugby: "A rugby lad", cricket: "A cricketer", cat: "A cat", traffic: "A local driver", bendy: "Bendy", train: "A train", crash: "A wall", society: "A Flag Lad", ladder: "A ladder lad", chair: "The Gaffer" };
const GANG_HOW: Record<string, string> = { naughtyBoy: "battered", rugby: "flattened", cricket: "batted", cat: "mauled", traffic: "ran over", bendy: "snapped", train: "ran down", crash: "stopped", society: "flagged", ladder: "laddered", chair: "cable-tied" };
/** Who you decked, by kind. */
const DECKED = ["a naughty boy", "a rugby lad", "a cricketer", "a Flag Lad", "a ladder lad", "the Gaffer"];
/** How a shot naughty boy (or rugby lad, or cricketer) goes in the kill feed: one at random each time. */
const NAUGHTY_DOWN = ["decked", "floored", "sorted out", "flattened", "sent home", "dropped", "laid out"];
/** And a shot cat: "X <this>". {c} is "a cat". */
const CAT_DOWN = ["did for {c}", "used up the last life of {c}", "sent {c} to the big cattery in the sky", "knocked {c} off its wall",
  "stopped {c} purring", "put {c} out for the night", "turned {c} into a draught excluder", "cancelled {c}", "gave {c} the snip, permanently"];
const CAT_PAINT = ["splatted {c}", "painted {c} a new colour", "gave {c} a new coat", "turned {c} into modern art", "tagged {c}"];
const anyOf = (list: string[]) => list[Math.floor(Math.random() * list.length)];
/** The warning when a gang of each kind is after you. */
const CHASED = ["Naughty boys are after you. Leg it!", "The rugby team are after you. Leg it!", "The cricket team are after you. Leg it!",
  "The Flag Lads are after you. Leg it!", "", "The Gaffer is after you. Leg it!"];
const isGang = (id: string) => id in GANG_NAME;
/** The ones of those that are accidents, not attacks: passive mode doesn't stop them. */
const ACCIDENTS = new Set(["traffic", "train", "crash"]);
/** The colour of someone's paintballs, from a player's own colour. Nobody else fires paint. */
const paintOf = (id: string) => (isGang(id) ? null : paintFor(colourFor(id)));
const KICK_WAIT = 0.15;                  // seconds after your last shot before your aim settles from the kick
const PAINT_SPEED = 120, PAINT_SPEED_SNIPER = 220;   // how fast a paintball flies, m/s
const SPOT_KEY = "cd-spots";             // last place you stood in each room, so rejoining puts you back
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
  police: "Police Sierra. H for the siren",
  transit: "Ford Transit: room for your mates in the back",
  icecream: "Mr Whippy. H for Greensleeves",
  milkfloat: "Milk float: fifteen miles an hour, flat out",
  c5: "Sinclair C5. Keep your head down",
  roller: "The heavy roller: slow, and it doesn't stop for anyone",
  xr3i: "Ford Escort XR3i: nought to sixty in under ten seconds",
  robin: "Reliant Robin: three wheels, so mind the corners",
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
}
interface Remote {
  id: string; name: string; colour: string; avatar: Avatar; life: number; lastSeen: number; lastShot: number;
  px: number; pz: number; stride: number;   // where they were last frame, and how far since their last footstep
  rideCode: number; rideView?: RideView;    // what they're riding (rides.ts), and it drawn under them
  cab?: number;                             // the cable car cabin they're in (1 or 2), if any
  deadLife?: number;                        // the life we've been told they lost, so a late position update can't stand them back up
  torch?: boolean;                          // their torch is on
  inCar?: boolean;                          // in a vehicle, by their own word (undefined: their page doesn't say)
  carOff?: number;                          // seconds they've said they're out while our list has them in a seat (a stale seat)
}

/** The end of a player's state message ("st"): after the twelve numbers everyone has always sent, the
 *  rest by name, so more can be added without upsetting pages that don't know it yet. Anything off is
 *  left out. */
interface StateExtra {
  cab?: number[];      // in a cable car cabin: which one (1 or 2), and where in it (x, y, z), so we draw them in our cabin there
  passive?: boolean;   // the game's in passive mode (only the host's say counts)
  host?: boolean;      // they say they're host
  wings?: boolean;     // the angel's wings on (wings.ts)
  glow?: boolean;      // flying with them, glowing gold
  car?: boolean;       // in a vehicle, by their own word: only then is their body hidden in a seat
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
    return { cab: cab?.every(Number.isFinite) ? cab : undefined, passive: e.passive === true, host: e.host === true,
      wings: e.wings === true, glow: e.glow === true, car: e.car === true };
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
  private ldT = 0;                                 // host: seconds to the next ladder list
  private ldHost = "";                             // who was host last frame, for handing the ladders over
  private ladderAsked = 0;                         // when we last asked the host to put one up or take one down
  readonly sports: Sports;
  readonly broadcast = new Broadcast();             // the TV cameras on your kicks and balls
  readonly voice: Voice;
  readonly vehicles: Vehicles;
  readonly traffic: Traffic;                     // cars driving themselves round the streets
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
  /** The vehicle you're driving. */
  private get car(): Vehicle | null { return this.ride?.seat === 0 ? this.ride.v : null; }
  private hornWas = false;                       // the horn key last frame, to switch a siren on and off
  private milkT = 0;                             // when the milk last went (ms)
  private busT = BUS_EVERY;                      // host: seconds till a spare bus goes back to a stop
  private nextNaughtyBoy = 1;
  /** Host: Novas full of naughty boys on their way somewhere, along a route. */
  private deliveries = new Map<Vehicle, Delivery>();
  private busMenu = 0;                           // the bus menu's open at a stop till then (ms): 1 or 2 to call one
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
  private useKey = false;                        // E pressed: get in or out
  /** The touch Jump button, held while driving: the handbrake. */
  handbrake = false;
  private vhT = 0;                               // host: seconds till the next vehicle list
  private vhKnown: boolean;                      // we know where the vehicles are: we started the game, or someone's told us
  private vsT = 0;                               // seconds till we next say where our vehicle is
  private lookAt = 0;                            // when the camera was last moved (ms), so the chase camera can swing back
  private engines = new Map<object, SFX.Engine>();
  private runT = new Map<string, number>();      // when we last ran each person over (ms), so one hit counts once
  private blood: Blood;
  private remotes = new Map<string, Remote>();
  private elsewhere = new Set<string>();            // players in this room on a different map
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
  private slowT = 0;                             // seconds of wading through seagull muck left (gulls.ts)
  private swarmLife = -1;                        // which life a cat swarm came for you in, to see if you lived through it
  private tummyT = 0;                            // tummy time not yet added to your wardrobe's count
  private unEarn = () => {};
  private kickKey = false;                       // Space pressed: kick, if you're lined up
  private leaveKey = false;                      // E pressed: walk off the ball
  private anyKey = false;                        // a key pressed: back from the TV cameras to your own eyes
  private convAt = new Map<string, number>();    // host: when each player last scored at the posts or stumps (ms)
  firing = false;
  aiming = false;
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
  /** The big map's key, which switches layers off the maps. */
  private mapKey: MapKey;
  private markers: Markers;                       // everyone's map markers
  private marks = new Map<string, { label: string; colour: string }>();   // the jobs' own markers ("@..."), by id
  readonly quests: Quests;                         // today's jobs, and the one we're on
  readonly invasion: Invasion;                     // the Flag Lads' hold on Bath
  private daily!: Daily;                           // today's jobs, shown when you join and under Tab
  private dailyT = -1;                             // when the panel goes after you join (performance.now; -1: not shown yet)
  private rideFrom: { x: number; z: number } | null = null;   // where you were last frame on a ride, for the metres ridden
  private held: RideKind | null = null;            // the ride you've got with you (rides.ts), and whether you're on it
  private swapAt: Item | null = null;              // a ride or a ladder at your feet while your hands are full: E swaps for it
  private riding = false;
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
    this.effects = new Effects(world.scene);
    this.blood = new Blood(world.scene, world.surface);
    this.skids = new Skids(world.scene, (x, z, y) => world.surface(x, z, y));
    watch(world.scene);   // everyone's guns switch between paintball markers and rifles with the setting
    listenForCheat((text) => this.toast(text, 2.5));
    this.naughtyBoys = new NaughtyBoys(map, world.scene);
    this.cats = new Cats(map, world.scene);
    this.bendy = new Bendy(map, world.scene);
    this.pickups = new Pickups(map, world.scene);
    this.ladders = new Ladders(map, world.scene);
    this.wings = new Wings(map, world.scene, this.weapon.scene, (t, s) => this.toast(t, s));
    // the solo on the heavenly guitar: each note to everyone, and theirs played where they are
    this.wings.onNote = (f, d, b) => this.net.send("gtr", [Math.round(f * 10) / 10, Math.round(d * 100) / 100, b]);
    this.ladders.onRaise = (x, y, z) => SFX.ladderUp(...this.hear(x, y, z));
    this.sports = new Sports(map, world.scene);
    this.sports.onSay = (text, secs) => this.toast(text, secs);
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
    this.traffic.onBoom = (x, y, z) => this.carGoesUp(x, y, z);
    this.headlights = new Headlights(world.scene);
    this.torches = new Torches(world.scene);
    this.traffic.onUnpark = (i) => this.vehicles.unpark(i);
    this.traffic.onCrunch = (x, y, z, force) => SFX.crash(force, ...this.hear(x, y, z));
    this.traffic.onSmoke = (x, y, z, thick) => { if (Math.hypot(x - this.camera.position.x, z - this.camera.position.z) < 160) this.effects.smoke(new THREE.Vector3(x, y, z), thick); };
    this.mineTour = new MineTour(map, world.scene);
    this.deliDoor = new DeliDoor(map, world.scene);
    this.breakdown = new Breakdown(map, world.scene);
    this.vhKnown = !this.peers().length;
    this.naughtyBoys.onSwing = (x, y, z, voice) => {
      const [d, pan] = this.hear(x, y + 1.4, z);
      SFX.punch(d, pan);
      if (Math.random() < 0.5) SFX.effort(d, pan, voice);
    };
    this.naughtyBoys.onShout = (x, y, z, voice, kind, line) => {
      const [d, pan] = this.hear(x, y + 1.6, z);
      if (kind === NAUGHTY) SFX.shout(d, pan, voice); else Posh.speak(line, voice, d);
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
    this.minimap.spots = [this.mineTour.spot(), this.deliDoor.spot()].filter((s) => !!s);
    $("minimap").addEventListener("pointerdown", (e) => { e.stopPropagation(); this.toggleMap(); });
    $("bigmap").addEventListener("pointerdown", (e) => { e.stopPropagation(); this.toggleMap(); });
    // tapping the full map itself puts your marker there (or takes it down, tapping it again)
    this.markers = new Markers(world.scene);
    this.mapGestures($("bigmapcanvas") as HTMLCanvasElement);
    this.buildSpawns();
    this.loadPubs();
    this.myRide = new RideView(world.scene);
    this.rideTricks = new RideTricks((text, secs) => this.toast(text, secs));
    this.player.paved = (x, z) => world.paved(x, z);
    this.player.lift = (x, z) => world.surface(x, z) - map.ground(x, z);
    this.quests = new Quests(this.questWorld(), () => this.pubsReady);
    this.quests.onDone = (won) => { if (won) { Quips.kill(true); noteDaily("job"); } };
    // something new for your wardrobe: say so, and show everyone
    this.unEarn = onEarn((w) => {
      this.toast(`New in your wardrobe: ${w.name}!`, 3.5);
      this.feed(`You earned <b>${esc(w.name)}</b> for your wardrobe (pause menu)`);
      SFX.jobStep();
      this.hello();
    });
    const self = this;
    this.invasion = new Invasion({
      map: this.map, scene: this.world.scene, naughtyBoys: this.naughtyBoys,
      get selfId() { return self.net.selfId; },
      get isHost() { return self.isHost; },
      me: () => ({ x: this.player.pos.x, y: this.player.pos.y, z: this.player.pos.z, alive: this.alive, yaw: this.player.yaw }),
      players: () => this.targets(),
      pubs: () => this.pubList,
      send: (data, to) => this.net.send("bv", data, to),
      toast: (text, secs) => this.toast(text, secs),
      feed: (html) => this.feed(html),
      mark: (id, at, label, colour) => this.questWorld().mark(id, at, label, colour),
      prize: (x, z, good) => { this.pickups.bonus(x, z, good); this.net.send("pk", this.pickups.snapshot()); },
      give: (x, z, kind) => { this.pickups.place(x, z, kind); this.net.send("pk", this.pickups.snapshot()); },
    });
    this.daily = new Daily((text, secs) => this.toast(text, secs), () => this.invasion.status());
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
    net.on("hello", (d, from) => this.onHello(d, from));
    // the debug panel's "+3 hours" (daylight.ts): the host moves the game's clock on and tells
    // everyone; anyone else asks the host
    net.on("clk", here((d, from) => {
      if (!Array.isArray(d) || typeof d[1] !== "number") return;
      if (d[0] === "add" && this.isHost) { setSkip(getSkip() + d[1]); this.net.send("clk", ["set", getSkip()]); }
      else if (d[0] === "set" && from === this.hostId && !this.isHost) setSkip(d[1]);
    }));
    setSkip(0);   // a new game starts on the shared time, until its host says otherwise
    clockLink.ask = (h) => {
      if (this.isHost) { setSkip(getSkip() + h); this.net.send("clk", ["set", getSkip()]); }
      else this.net.send("clk", ["add", h], this.hostId);
    };
    net.on("st", (d, from) => this.onState(d, from));
    net.on("gtr", here((d, from) => {
      const v = this.posOf(from);
      if (!v || !Array.isArray(d)) return;
      const [f, dur, bend] = d.map(Number);
      if (f > 50 && f < 4000 && dur > 0 && dur < 3 && Math.abs(bend) <= 12) SFX.guitarLead(f, dur, bend, ...this.hear(v.x, v.y + 1.2, v.z));
    }));
    net.on("shot", here((d, from) => this.onShot(d, from)));
    // kills, respawns and the scoreboard follow you across maps, so they go to and come from the
    // match host (the one host for the whole room), not this map's host. Not wrapped in here():
    // a traveller's hit is still a hit, wherever they've gone.
    net.on("hit", (d, from) => { if (this.isMatchHost) this.applyHit(from, d); });
    net.on("ev", here((d) => this.onEvent(d)));
    net.on("sb", (d, from) => { if (from === this.matchHostId) this.onScores(d); });
    net.on("rs", (d, from) => { if (this.isMatchHost) this.applyRespawn(from, d.life); });
    net.on("ch", here((d: NaughtyBoyState, from) => { if (from === this.hostId && !this.isHost) this.naughtyBoys.apply(d); }));
    net.on("chit", here((d, from) => { if (this.isHost) this.applyNaughtyBoyHit(from, d); }));
    net.on("kt", here((d: CatState, from) => { if (from === this.hostId && !this.isHost) this.cats.apply(d); }));
    net.on("khit", here((d, from) => { if (this.isHost) this.applyCatHit(from, d); }));
    net.on("bd", here((d: BendyState, from) => { if (from === this.hostId && !this.isHost) this.bendy.apply(d); }));
    net.on("bhit", here((d, from) => { if (this.isHost) this.applyBendyHit(from, d); }));
    net.on("pick", here((d, from) => { if (this.isHost) this.applyPick(from, d); }));
    net.on("pk", here((d, from) => { if (from === this.hostId && !this.isHost) this.pickups.apply(d); }));
    net.on("ldr", here((d, from) => { if (this.isHost) this.applyLadder(from, d); }));
    net.on("lds", here((d, from) => {
      // a host that's just handed over sends us what it had: keep it all
      if (this.isHost) { if (from !== this.net.selfId) { this.ladders.merge(d); this.sendLadders(); } return; }
      if (from !== this.hostId) return;
      const had = this.ladders.carriers.has(this.net.selfId), asked = performance.now() - this.ladderAsked < 3000;
      this.ladders.apply(d);
      if (asked && !had && this.ladders.carriers.has(this.net.selfId)) { SFX.pickup("ladder"); this.tookLadder(); }   // taken down to carry
    }));
    net.on("kick", here((d) => this.sports.remoteKick(d)));
    net.on("conv", here((d, from) => { if (this.isHost) this.applyConv(from, d); }));
    net.on("call", here((d, from) => { if (this.isHost) this.applyCall(from, d); }));
    net.on("vin", here((d, from) => { if (this.isHost) this.applyEnter(from, d); }));
    net.on("vout", here((d, from) => { if (this.isHost) this.applyExit(from, d); }));
    // updates from whoever's driving (or from the host, for a car full of naughty boys)
    net.on("vs", here((d, from) => {
      const v = this.vehicles.get(d?.[0]);
      if (v && v !== this.car && (v.driver === from || ((!v.driver || v.driver.startsWith("@")) && from === this.hostId))) v.push(d);
    }));
    // a newcomer takes the list from whoever sends it first (they may be the host already, with the lowest id)
    net.on("tf", here((d, from) => { if (from === this.hostId && !this.isHost) this.traffic.apply(d); }));
    net.on("tfw", here((d, from) => { if (from === this.hostId && !this.isHost) this.traffic.applyWrecks(d); }));
    net.on("tfx", here((d, from) => { if (this.isHost && Array.isArray(d)) this.traffic.shove(d[0], d[1], d[2], d[3], from); }));
    net.on("tfp", here((d, from) => { if (this.isHost && Array.isArray(d)) this.knockParked(d[0], d[1], d[2], d[3], from); }));
    net.on("vk", here((d, from) => {
      const v = Array.isArray(d) ? this.vehicles.list.find((o) => o.i === d[0]) : undefined;
      if (this.isHost && v) this.knockVehicle(v, d[1], d[2], d[3], from);
    }));
    net.on("vh", here((d, from) => { if (!this.vhKnown || (from === this.hostId && !this.isHost)) this.onVehicles(d); }));
    net.on("cn", here((d, from) => { if (from === this.hostId && !this.isHost) this.world.canal?.apply(d); }));
    net.on("cnu", here((d, from) => { if (this.isHost) this.applyCanal(from, d); }));
    net.on("trh", here((d, from) => { if (this.isHost) this.applyTrain(from, d); }));
    net.on("ow", here((d, from) => { if (this.isHost) this.applyCrash(from, d); }));
    net.on("mk", here((d, from) => this.onMarker(d, from)));
    net.on("qe", here((d, from) => this.quests.onMessage(d, from)));
    net.on("bv", here((d, from) => this.invasion.onMessage(d, from)));
    if (world.canal) world.canal.onWater = (i, x, y, z, vol) => this.flowing.set(i, [x, y, z, vol]);
    net.onJoin = (id) => {
      this.hello(id);
      this.voice.join(id);
      if (this.isHost) { this.sendScores(); this.pkT = 0; this.ldT = 0; }
      const mine = this.markers.at(this.net.selfId);
      if (mine) this.net.send("mk", [mine.x, mine.y, mine.z], id);
      this.quests.joined(id);
      this.invasion.joined(id);
    };
    net.onLeave = (id) => {
      this.elsewhere.delete(id);
      this.known.delete(id);
      this.markers.clear(id);
      this.since.delete(id);
      const r = this.remotes.get(id);
      if (r) { this.world.scene.remove(r.avatar.root); this.remotes.delete(id); this.notice(`<b style="color:${r.colour}">${esc(r.name)}</b> left the game`, false); }
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
      if (!$("bigmap").hidden) { if (e.button === 0) this.markAtCursor(); return; }
      if (e.button === 0) this.firing = true;
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
      if (e.code === "Tab") { e.preventDefault(); this.dailyT = 0; $("scoreboard").classList.remove("join"); $("scoreboard").hidden = false; this.renderScores(); }
      if (e.code === "KeyR" && this.active) this.reload();
      if (this.active && !e.repeat) {
        const n = ["Digit1", "Digit2", "Digit3"].indexOf(e.code);
        // at a bus stop with the menu up, 1 and 2 call a bus rather than switching weapons
        if (BUS_KEYS[e.code] && this.busMenu > performance.now()) this.callBus(BUS_KEYS[e.code]);
        else if (n >= 0) this.switchTo(SLOTS[n], true);
        if (e.code === "KeyQ") this.cycleWeapon(1);
      }
      if (this.active && !e.repeat && e.code === "Space") this.kickKey = true;
      if (this.active && !e.repeat && e.code === "KeyE") { this.leaveKey = true; this.useKey = true; }
      if (this.active && !e.repeat && this.broadcast.on && e.code !== "Tab" && e.code !== "KeyM") this.anyKey = true;
      if (e.code === "KeyB" && !e.repeat && this.active) this.toggleBinoculars();
      if (e.code === "KeyX" && !e.repeat && this.active) this.toggleRide();
      if (e.code === "Backspace" && !e.repeat && this.active && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); this.quests.restart(); }
      if (e.code === "KeyF" && !e.repeat && this.active) this.toggleTorch();
      if (e.code === "KeyM" && !e.repeat) this.toggleMap();
      if (!$("bigmap").hidden && ["Equal", "NumpadAdd", "Minus", "NumpadSubtract"].includes(e.code)) {
        const c = this.minimap.cursor;
        this.minimap.zoomFull(e.code === "Equal" || e.code === "NumpadAdd" ? 1.5 : 1 / 1.5, c?.[0], c?.[1]);
      }
      if (e.code === "KeyG" && !e.repeat && this.active) this.markLook();
      if (e.code === "KeyV" && !e.repeat && this.active) this.voice.radio(true);
    }, sig);
    addEventListener("keyup", (e) => {
      if (e.code === "Tab") $("scoreboard").hidden = true;
      if (e.code === "KeyV") this.voice.radio(false);
    }, sig);
    addEventListener("blur", () => this.voice.radio(false), sig);
  }

  toggleMap() {
    const el = $("bigmap");
    el.hidden = !el.hidden;
    this.minimap.cursor = null;   // it starts on you, the first time the mouse moves
    this.minimap.resetFull();     // and the whole map shows
    this.mapKey.hideTip();
    this.firing = false;
  }

  // ---- map markers --------------------------------------------------------------------------
  /** Put your marker at scene (x, z) on the ground there (y if known), or take it down (no x), and tell everyone. */
  private setMarker(x?: number, z?: number, y?: number) {
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
    this.markers.set(me, x, y, z, colourFor(me));   // your colour, the same one everyone else sees it in
    this.net.send("mk", [x, y, z]);
    SFX.tick();
  }

  /** A tap on the full map: a marker there, or, on your own marker, take it down. */
  private markOnMap(clientX: number, clientY: number) {
    const at = this.minimap.fromFull(clientX, clientY), mine = this.markers.at(this.net.selfId);
    if (!at) return;
    if (mine && Math.hypot(mine.x - at.x, mine.z - at.z) < 22 * at.mpp) this.setMarker();
    else this.setMarker(at.x, at.z);
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
      if (down.size === 2) { const [a, b] = [...down.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); moved = 99; }
    });
    c.addEventListener("pointermove", (e) => {
      const p = down.get(e.pointerId);
      if (!p) return;
      const w = c.getBoundingClientRect().width || 1;
      if (down.size === 1) {
        moved += Math.hypot(e.clientX - p.x, e.clientY - p.y);
        if (moved > 8) this.minimap.panFull((e.clientX - p.x) / w, (e.clientY - p.y) / w);
      } else if (down.size === 2) {
        const [a, b] = [...down.entries()].map(([id, q]) => (id === e.pointerId ? { x: e.clientX, y: e.clientY } : q));
        const d = Math.hypot(a.x - b.x, a.y - b.y), [u, v] = frac((a.x + b.x) / 2, (a.y + b.y) / 2);
        if (pinch > 0 && d > 0) this.minimap.zoomFull(d / pinch, u, v);
        pinch = d;
        this.minimap.panFull((e.clientX - p.x) / w / 2, (e.clientY - p.y) / w / 2);
      }
      p.x = e.clientX; p.y = e.clientY;
    });
    const up = (e: PointerEvent) => {
      if (!down.delete(e.pointerId)) return;
      if (!down.size && moved <= 8 && e.type === "pointerup") this.markOnMap(e.clientX, e.clientY);
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
    if (!c) { this.toast("Move the mouse to aim, then click to mark", 2); return; }
    // the crosshair on the key: switch that row instead
    const r = $("bigmapcanvas").getBoundingClientRect();
    if (this.mapKey.clickAt(r.left + c[0] * r.width, r.top + c[1] * r.height)) return;
    if (c[0] < 0) return;   // beside the map, between the key's rows
    const at = this.minimap.fromFullAt(c[0], c[1]), mine = this.markers.at(this.net.selfId);
    if (!at) return;
    if (mine && Math.hypot(mine.x - at.x, mine.z - at.z) < 22 * at.mpp) this.setMarker();
    else this.setMarker(at.x, at.z);
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
    this.setMarker(p.x, p.z, hit.kind === "ground" ? undefined : this.map.ground(p.x, p.z));
  }

  /** Someone else's marker: where it is, or 0 when they take it down. */
  private onMarker(d: unknown, from: string) {
    if (!Array.isArray(d)) { this.markers.clear(from); return; }
    const [x, y, z] = d.map(Number);
    if (![x, y, z].every(Number.isFinite)) return;
    const had = this.markers.has(from);
    const r = this.remotes.get(from);
    this.markers.set(from, x, y, z, r?.colour ?? colourFor(from));
    if (!had) this.feed(`<b>${esc(r?.name ?? "Someone")}</b> put a marker on the map`);
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
    const zoom = 1 - Math.max(this.weapon.aim * this.weapon.gun.zoom, this.bino * BINO_ZOOM);
    this.player.look(dx, dy, zoom);
    this.lastLook.dx += dx; this.lastLook.dy += dy;
    if (dx || dy) this.lookAt = performance.now();
  }

  /** The jump button: walks off the ball if you're lining up a kick, and is the handbrake while driving. */
  jump() {
    if (this.ride) { if (this.car) this.handbrake = true; }
    else if (this.sports.lining) this.leaveKey = true;
    else { this.player.jump(); this.player.jumpHeld = true; }
  }

  /** The jump button let go: off the handbrake (and a ride's verb let go). */
  jumpEnd() { this.handbrake = false; this.player.jumpHeld = false; }

  /** Get in the vehicle you're next to, or out of the one you're driving (E, or the Car button). */
  useCar() { this.useKey = true; }

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
    const w = this.weapon;
    for (let i = 1; i < SLOTS.length; i++) {
      const k = SLOTS[(SLOTS.indexOf(w.kind) + way * i + SLOTS.length * 2) % SLOTS.length];
      if (w.has(k)) { this.switchTo(k); return; }
    }
  }

  get mapId(): string { return this.map.d.id ?? DEFAULT_MAP; }

  /** Who has said hello: carried across to the new Game when travelling (main.ts's travel). */
  get knownIds(): string[] { return [...this.known]; }

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

  /** For the debug panel (debug.ts): the map, who's host and the players we know of. */
  debugInfo() {
    const now = performance.now();
    return {
      map: this.map, mapId: this.mapId, host: this.hostId, elsewhere: [...this.elsewhere],
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
  // (tools/pubs.py). Until that arrives, or on a map without one, it's the pubs signed in the map.

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
    fetch(`${import.meta.env.BASE_URL}maps/${this.mapId}-pubs.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { pb?: [number, number, string, number | null, number | null][] } | null) => {
        if (!d?.pb?.length) return;
        this.pubList = d.pb.map(([x, y, name, rating, a]) => ({ name: String(name), x: +x, z: -y, yaw: a ?? undefined, rating: rating ?? null }));
      })
      .catch(() => { /* the single-file build has no pub list: keep the signed ones */ })
      .finally(() => (this.pubsReady = true));
  }

  /** The pubs inside the force field (scene x, z), with how far each is from you. */
  pubs(): { i: number; name: string; rating: number | null; x: number; z: number; far: number }[] {
    const p = this.player.pos;
    return this.pubList
      .map((q, i) => ({ i, name: q.name, rating: q.rating, x: q.x, z: q.z, far: Math.hypot(q.x - p.x, q.z - p.z) }))
      .filter((q) => this.map.fieldEdge(q.x, q.z) > 1);
  }

  /** The force field: its centre (data coords, metres north) and radius, for framing the pub map. */
  get fieldArea() { return { x: this.map.fieldX, y: -this.map.fieldZ, r: this.map.field }; }

  /** Everyone's map markers, with whose they are (the jobs' own markers marked as such). */
  private markerList() {
    return this.markers.list(this.net.selfId, (id) => {
      const job = this.marks.get(id);
      if (job) return { name: job.label, colour: job.colour, job: true };
      const r = this.remotes.get(id);
      return { name: r?.name ?? "Player", colour: r?.colour ?? colourFor(id) };
    });
  }

  /** Draw the pub map (see Minimap.drawView), with you on it. */
  drawPubMap(c: HTMLCanvasElement, cx: number, cy: number, mpp: number, pins: Pin[], redraw: () => void) {
    const p = this.player;
    this.minimap.markers = this.markerList();   // (the game may be paused behind the menu)
    return this.minimap.drawView(c, cx, cy, mpp, { x: p.pos.x, z: p.pos.z, yaw: p.yaw }, pins, redraw);
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

  /** Go straight to pub i (from pubs()). Returns why not, if you can't just now. */
  goTo(i: number): string | null {
    const pub = this.pubList[i];
    if (!pub) return "That pub isn't on this map.";
    if (!this.alive) return "Wait till you're back on your feet.";
    if (performance.now() - this.hurtAt < 5000) return "Not while someone's having a go at you. Get out of the fight first.";
    const at = this.outside(pub);
    if (this.ride) this.getOut();
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
      r = { id, name: "Player", colour, avatar: new Avatar("Player", colour, id), life: 0, lastSeen: performance.now(), lastShot: -1e9, px: 0, pz: 0, stride: 0, rideCode: 0 };
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
      if (this.elsewhere.has(from)) return;
      this.elsewhere.add(from);
      const r = this.remotes.get(from);
      if (r) { this.world.scene.remove(r.avatar.root); this.remotes.delete(from); }
      // they're still in the match: keep their score, just stop drawing them and drop their
      // messages (their map's coordinates mean nothing here)
      if (this.scores[from]) this.scores[from].name = name;
      this.toast(`${name} has gone to ${mapName(String(d?.map || DEFAULT_MAP))}. You'll still see their score; take a train to join them.`, 7);
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
    if (from === this.hostId && (e?.host ?? true)) this.setRoomPassive(!!e?.passive);
    r.avatar.setWings(!!e?.wings, !!e?.glow);
    // whether they're in a vehicle, by their own word (undefined from pages that don't say)
    r.inCar = e?.car;
    r.lastSeen = performance.now();
    this.voice.heard(from, talk);
    if (life !== r.life) { r.life = life; r.avatar.teleport(); this.blood.stop(from); }
    if (this.isHost) this.catchUpLife(from, life);
    r.avatar.alive = alive === 1 && life !== r.deadLife;
    // riding a cable car cabin, they send where they are in it as well: draw them in our cabin there, so
    // they go along with it rather than trailing and running after it (and older pages just use x, y, z)
    const [cab, cx, cy, cz] = this.world.cableway && e?.cab ? e.cab : [0, 0, 0, 0];
    if (cab !== r.cab) { r.cab = cab; r.avatar.restart(); r.avatar.base = cab ? this.world.cableway!.cabinAt(cab) : null; }
    if (cab) r.avatar.push({ t: performance.now(), x: cx, y: cy, z: cz, yaw, pitch, crouch, prone });
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
        mark ? () => this.paintLands(o, at && !body ? at() : e, mark, col, sniper, undefined, undefined, body) : undefined, on ?? undefined);
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
    }
  }

  private onEvent(d: any) {
    const me = this.net.selfId;
    const nameOf = (id: string) => (isGang(id) ? GANG_NAME[id] : id === me ? this.name : this.remotes.get(id)?.name ?? this.scores[id]?.name ?? "Someone");
    const colOf = (id: string) => (isGang(id) ? "#d8d8d8" : id === me ? "#e3a33b" : colourFor(id));
    const who = (id: string) => `<b style="color:${colOf(id)}">${esc(nameOf(id))}</b>`;
    if (d.k === "dmg" && d.t === me && d.life === this.life) {
      this.broadcast.skip();   // never watching the telly while someone's hitting you
      this.hp = d.hp;
      this.hurtT = 0.5;
      this.hurtAt = performance.now();
      SFX.hurt();
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
      if (d.by === me && d.t !== me) { SFX.kill(); Quips.kill(false); this.toast(`You ${d.m ? "battered" : d.w === RUN ? "ran over" : gore() ? "shot" : "splatted"} ${nameOf(d.t)}`, 1.5); }
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
        const how = d.w === RUN ? "ran over" : d.w === BLAST ? "blew up" : d.m ? "decked" : gore() ? anyOf(NAUGHTY_DOWN) : anyOf(["splatted", "painted", "tagged", "decked"]);
        this.feed(`${who(d.by)} ${how} ${them}${d.h ? " (headshot)" : ""}`);
        if (d.by === me) { SFX.kill(); Quips.kill(true); this.toast(`You ${how} ${them}`, 1.5); if ((c?.kind ?? NAUGHTY) === NAUGHTY) noteDaily("naughty"); }
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
    if (d.kind === "pint") { this.hp = d.hp ?? this.hp; this.toast(`Cheers! +${PINT_HEAL} health`, 1.8); noteDaily("pint"); }
    if (d.kind === "fizz") { this.hp = d.hp ?? 100; this.toast("Co-op Bucks Fizz: full health", 2); }
    if (d.kind === "boost") { this.boostT = BOOST_SECONDS; this.toast(`Lucozade: double damage for ${BOOST_SECONDS} seconds`, 2.5); }
    if (isRide(d.kind)) this.giveRide(d.kind);
    if (d.kind === "ladder" && !this.tookLadder()) this.toast(this.freeMode ? "A ladder! Face a building and press Ride to put it up to the roof" : "A ladder! Face a building and press X to put it up to the roof", 3.5);
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
      this.toast("Sniper rifle: 10 rounds. Right click for the scope, 3 to pick it, 2 for the rifle", 3.5);
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

  /** What you're carrying in your one slot: a ride, the ladder, or nothing. */
  private carrying(): RideKind | "ladder" | null {
    return this.held ?? (this.ladders.carriers.has(this.net.selfId) ? "ladder" : null);
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
  private paintLands(from: THREE.Vector3, at: THREE.Vector3, mark: number, colour: string, heavy: boolean, n?: THREE.Vector3, kind?: "building" | "barrier" | "tree" | "ground", body?: OnBody | null) {
    if (body) {
      body.root.updateMatrixWorld(true);
      at = body.part.localToWorld(body.p.clone());
      const out = body.n.clone().transformDirection(body.part.matrixWorld);
      this.effects.splash(at, out, colour, 7);
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
    this.effects.splash(at, out, colour, mark === 2 ? 10 : 7);
    if (mark === 1) this.blood.mark(at, out, colour);
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

  private applyNaughtyBoyHit(from: string, d: { c: number; g: number; head: boolean; w?: number; x?: number; s?: number }) {
    const shooter = this.entry(from);
    if (!shooter.alive) return;
    const res = this.naughtyBoys.damage(d.c, d.g, this.hitDamage(d));
    if (!res) return;
    const at = this.posOf(from);
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
  private targets(): Target[] {
    const p = this.player.pos;
    const out: Target[] = [{ id: this.net.selfId, x: p.x, y: p.y, z: p.z, alive: this.alive, passive: this.passive }];
    for (const r of this.remotes.values()) out.push({ id: r.id, x: r.avatar.x, y: r.avatar.y, z: r.avatar.z, alive: r.avatar.alive, passive: this.passive });
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
      if (c) v = this.vehicles.spawn(d.v, c.paint, d.t!, c.x, c.z, c.a);
    }
    if (!v || v.driver.startsWith("@")) return;
    const gone = (id: string) => id !== from && id !== this.net.selfId && !this.peers().includes(id);
    const want = Number.isInteger(d.k) && d.k! >= 0 && d.k! < v.seats.length && (!v.seats[d.k!] || gone(v.seats[d.k!]) || v.seats[d.k!] === from) ? d.k! : -1;
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
  travelTo(toMap: string, at: { x: number; z: number; yaw: number }): boolean {
    if (!this.onTravel) return false;
    if (!this.alive) { this.toast("Wait till you're back on your feet", 2.5); return false; }
    if (toMap === this.mapId) return false;
    this.onTravel(toMap, {
      born: this.born, since: [...this.since], scores: this.scores,
      hp: this.hp, life: this.life, alive: this.alive,
      at, cameFrom: this.mapId, voice: this.voice,
      arriveAt: this.pendingArrival,
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
    let throttle = key("KeyW", "ArrowUp") - key("KeyS", "ArrowDown"), steer = key("KeyA", "ArrowLeft") - key("KeyD", "ArrowRight");
    if (on && !throttle && !steer && Math.hypot(p.joy.x, p.joy.y) > 0.15) { throttle = -p.joy.y; steer = -p.joy.x; }
    const handbrake = on && (k.has("Space") || this.handbrake), horn = on && (k.has("KeyH") || this.firing);
    // the police car's siren and the ice cream van's chimes: H switches them on and off
    if (v.spec.siren && horn && !this.hornWas) {
      v.siren = !v.siren;
      if (v.siren && v.kind === "icecream") this.toast("Greensleeves: everyone can hear you coming", 2);
    }
    this.hornWas = horn;
    v.drive(dt, { throttle, steer, handbrake, horn: horn && !v.spec.siren }, (x, z) => this.world.paved(x, z), this.shoving(v, this.net.selfId));
    v.pose(dt, performance.now());
    if (v.impact > 3) SFX.crash(Math.min(1, (v.impact - 3) / 12));
    if (v.spec.milk && v.impact > 3.5) this.smashMilk(v);
    if (v.flipped) { SFX.crash(0.7); this.toast(`Over she goes. E to get out`, 3); }
    if (Math.abs(v.speed) > (v.spec.crush ? 0.6 : 4)) this.runOver(v);
    // in the driver's seat
    const s = v.seat();
    p.pos.set(s.x, s.y, s.z);
    p.vel.set(v.vx, 0, v.vz);
    p.onGround = true;
    p.speed = Math.abs(v.speed);
    // the chase camera: look about with the mouse, and it swings back behind once you're on the move
    if (performance.now() - this.lookAt > 1500 && Math.abs(v.speed) > 2) {
      const turn = Math.atan2(Math.sin(s.yaw - p.yaw), Math.cos(s.yaw - p.yaw));
      p.yaw += turn * Math.min(1, dt * 2.5);
      p.pitch += (-0.2 - p.pitch) * Math.min(1, dt * 2.5);
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

  /** A passenger: sat in your seat as it goes along, looking about through your own eyes (and free to shoot). */
  private rideAlong(seat: number, v: Vehicle) {
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

  /** A car in the traffic goes up at (x, y, z): the fireball and the bang, the camera jolts, and a car you're driving gets shoved. */
  private carGoesUp(x: number, y: number, z: number) {
    this.effects.explosion(new THREE.Vector3(x, y, z));
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
      if (g !== undefined && s > 0) this.applyNaughtyBoyHit(by, { c: c.i, g, head: false, w: BLAST, s });
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
      const claim = { c: c.i, g, head: false, w: RUN, s };
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
  /** E at a platform by a train with its doors open: board it, and take it to the town at the far
   *  end of its linked route (railway.ts). True if it did something. */
  private trainUse(): boolean {
    const rail = this.world.railway, p = this.player.pos;
    if (!rail || !this.alive || this.car || this.ride) return false;
    const board = rail.boardingAt(p.x, p.z, p.y);
    if (!board) return false;
    const link = (rail.d.links ?? []).find((l) => l.line === board.route.name);
    if (!link) { this.toast("This train isn't going anywhere yet.", 2.5); return false; }
    this.blackout(`${link.station} to ${link.to_station}`);
    // the arrival platform is on the other map, so it's found once that map has loaded (main.ts's
    // travel asks the new world for it): here we only say where we're going
    this.pendingArrival = link.to_station;
    this.travelTo(link.to, { x: this.player.pos.x, z: this.player.pos.z, yaw: this.player.yaw });
    return true;
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
    const b = canal.tillerNear(p.x, p.y, p.z, me);
    if (b) {
      if (this.isHost) canal.take(b.n, me);
      else { b.helm = me; this.net.send("cnu", { k: "take", b: b.n }, this.hostId); }
      this.throttle = 0; this.tiller = 0;
      this.toast(`You take the tiller of ${b.name}. ${this.freeMode ? "Stick to drive" : "W/S throttle, A/D tiller, E to let go"}`, 3.5);
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
    const key = (a: string, c: string) => (on && (k.has(a) || k.has(c)) ? 1 : 0);
    let push = key("KeyW", "ArrowUp") - key("KeyS", "ArrowDown"), side = key("KeyA", "ArrowLeft") - key("KeyD", "ArrowRight");
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
    this.standAtTiller(b);
  }

  private standAtTiller(b: NonNullable<ReturnType<NonNullable<World["canal"]>["helmOf"]>>) {
    const p = this.player, t = this.world.canal!.stern(b);
    p.pos.set(t.x, t.y, t.z);
    p.vel.set(0, 0, 0);
    p.onGround = true;
    p.speed = 0;
    p.applyToCamera(this.camera);
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

  /** Into a mate's trolley (E by it), or back out. Returns true if E was for that. */
  private useBasket(): boolean {
    if (this.basket) { this.leaveBasket(); return true; }
    if (!this.alive || this.riding) return false;
    const r = this.trolleyNear();
    if (!r) return false;
    this.basket = r.id;
    this.toast(`In ${r.name}'s trolley. E to climb out`, 2.5);
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
    if (this.riding) this.myRide.pose(p.pos.x, p.pos.y, p.pos.z, this.map.ground(p.pos.x, p.pos.z), p.heading, p.rideV, dt, p.trick, p.manual ? 1 : 0, Math.min(1, p.tumble * 3));
    for (const r of this.remotes.values()) {
      const kind = r.avatar.alive ? rideOf(r.rideCode) : null;
      if (kind && !r.rideView) r.rideView = new RideView(this.world.scene);
      if (!r.rideView) continue;
      r.rideView.set(kind);
      if (!kind) continue;
      const a = r.avatar, mx = a.x - r.px, mz = a.z - r.pz, moved = Math.hypot(mx, mz);
      // it points the way they're going (a pogo stick, the way they face)
      const heading = rideSpecs[kind].pogo || moved < 0.02 ? (rideSpecs[kind].pogo ? a.yaw : r.rideView.heading) : Math.atan2(-mx, -mz);
      r.rideView.pose(a.x, a.y, a.z, this.map.ground(a.x, a.z), heading, moved / Math.max(dt, 1e-3), dt);
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
      if (helm) this.standAtTiller(helm);
    }
    if (rail) {
      const onTrain = !!this.carrier && rail.near.includes(this.carrier.m as never);
      const hit = rail.update(dt, p.x, p.y, p.z, this.alive && !this.ride && !onTrain);
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
    this.solid = [...(canal?.moving ?? []), ...(rail?.near ?? []), ...(cable?.near ?? [])];
    M.push(...this.solid);
    // whatever you're standing on has just moved: go with it, and so does the view
    if (this.carrier && !helm) {
      const was = this.player.pos.clone();
      this.carry();
      this.camera.position.add(this.player.pos.clone().sub(was));
    }
    const before = this.carrier?.m;
    this.findCarrier();
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
    if (this.ride || !this.alive) return;
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

  /** Engines running for everything with someone at the wheel, near enough to hear (sirens and chimes carry further). */
  private engineSounds() {
    for (const v of this.vehicles.list) {
      let e = this.engines.get(v);
      const [d, pan] = this.hear(v.x, v.y + 1, v.z);
      if (!v.driver || d > (v.siren ? 220 : 50)) {
        if (e) { e.stop(); this.engines.delete(v); }
        continue;
      }
      if (!e) {
        const started = SFX.engine(v.spec.engine, v.spec.siren);
        if (!started) continue;
        this.engines.set(v, (e = started));
      }
      // the one you're in sounds as if you're in it, not from where the camera trails behind
      e.set(v.rpm, v.gas, v.horn, v === this.ride?.v ? Math.min(d, 2) : d, pan, v.siren);
    }
    // the nearest few cars in the traffic
    const near = [...this.traffic.list].map((c) => ({ c, h: this.hear(c.x, c.y + 1, c.z) })).sort((a, b) => a.h[0] - b.h[0]);
    near.forEach(({ c, h: [d, pan] }, k) => {
      let e = this.engines.get(c);
      if (k >= 4 || d > 40 || c.wreck) { if (e) { e.stop(); this.engines.delete(c); } return; }
      if (!e) {
        const started = SFX.engine("petrol");
        if (!started) return;
        this.engines.set(c, (e = started));
      }
      e.set(c.rpm, c.gas, c.horn, d, pan);
    });
    // narrowboats chugging along
    const canal = this.world.canal;
    const boats = canal ? [...canal.moving].map((b) => ({ b, h: this.hear(b.x, b.y + 1, b.z) })).sort((a, b) => a.h[0] - b.h[0]) : [];
    boats.forEach(({ b, h: [d, pan] }, k) => {
      let e = this.engines.get(b);
      if (k >= 3 || d > 70) { if (e) { e.stop(); this.engines.delete(b); } return; }
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
      e.set(Math.min(1, t.v / 38), t.v > 1 ? 1 : 0, t.horn, d / 3, pan);
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
    if (route && !seen(route[0].x, route[0].z, 40)) {
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
    else if (d.m === "here") { this.myBus = -1; SFX.door(); this.toast(`Your ${what} is here. E to get on`, 3); }
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
    const stops = this.vehicles.allStops().filter((s) => unseen(s.x, s.z, 120)
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
    // or one of the Flag Lads' flags on a lamp post
    const flag = melee ? null : this.invasion.hit(origin, dir, maxD);
    if (flag) { maxD = flag.dist; victim = null; naughtyBoy = null; cat = null; boss = null; this.invasion.shoot(flag); this.hitT = 0.18; $("hitmarker").classList.remove("head"); SFX.hitMarker(false); }
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
      else if (paint) lands = () => this.paintLands(muzzle, at ? at() : end, 2, mine, heavy);
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
    if (victim) {
      const claim = { t: victim.id, head, life: victim.life, w: slot, x: this.boostT > 0 ? 2 : 1 };
      if (this.isMatchHost) this.applyHit(this.net.selfId, claim);
      else this.net.send("hit", claim, this.matchHostId);
    } else if (boss) {
      const claim = { g: boss.gen, head, w: slot, x: this.boostT > 0 ? 2 : 1 };
      if (this.isHost) this.applyBendyHit(this.net.selfId, claim);
      else this.net.send("bhit", claim, this.hostId);
    } else if (cat) {
      const claim = { c: cat.i, g: cat.gen, head, w: slot, x: this.boostT > 0 ? 2 : 1 };
      if (this.isHost) this.applyCatHit(this.net.selfId, claim);
      else this.net.send("khit", claim, this.hostId);
    } else if (naughtyBoy) {
      const claim = { c: naughtyBoy.i, g: naughtyBoy.gen, head, w: slot, x: this.boostT > 0 ? 2 : 1 };
      if (this.isHost) this.applyNaughtyBoyHit(this.net.selfId, claim);
      else this.net.send("chit", claim, this.hostId);
    } else if (bloke !== null) {
      mark = 1;
      if (melee) SFX.punch();
      else if (!paint) this.effects.impact(end, dir.clone().negate(), "#1f2a44", 4);
      this.breakdown.ouch(maxD);
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
    if (paint) this.effects.paintball(muzzle, end, mine, heavy ? PAINT_SPEED_SNIPER : PAINT_SPEED, lands, chase);
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
    const p = this.player, q = (v: number) => Math.round(v * 100) / 100, seat = this.car?.seat(), sat = !!this.ride;
    this.net.send("st", [q(p.pos.x), q(p.pos.y), q(p.pos.z), q(seat ? seat.yaw : p.yaw), seat ? 0 : q(p.pitch), sat || this.basket ? 1 : q(p.crouch),
      this.alive ? 1 : 0, this.life, this.sentTalk = this.voice.mode, sat ? 0 : q(p.prone), this.torchOn ? 1 : 0,
      this.basket ? IN_TROLLEY : this.riding ? rideCode(this.held) : 0,
      // and the rest by name (StateExtra), leaving out whatever's off
      stripped({ cab: this.cabinSpot()?.map(q), passive: this.passive, host: this.isHost, wings: p.wings, glow: this.wings.glowing, car: !!this.ride })]);
  }

  /** Which cable car cabin you're riding and where you are in it, or null. */
  private cabinSpot() {
    const p = this.player.pos;
    return this.carrier ? this.world.cableway?.local(this.carrier.m, p.x, p.y, p.z) ?? null : null;
  }

  // ---- frame ------------------------------------------------------------------------------
  update(dt: number) {
    const now = performance.now();
    const p = this.player, w = this.weapon;
    // lined up to kick or bowl, you stand still and the keys steer the ball; and you stand and watch it go
    const lining = this.sports.lining, filming = this.broadcast.on;
    if (this.useKey) {
      this.useKey = false;
      if (!this.car && this.alive && this.mineTour.near(p.pos.x, p.pos.z, p.pos.y)) this.goDownMine();
      else if (!this.car && this.alive && this.deliDoor.near(p.pos.x, p.pos.z, p.pos.y)) this.goInDeli();
      else if (!this.car && !this.ride && this.quests.use()) { /* a job */ }
      else if (!this.car && !this.ride && this.useBasket()) { /* in or out of a trolley */ }
      else if (!this.ride && this.canalUse()) { /* a tiller or a lock */ }
      else if (!this.car && !this.ride && this.useSwap()) { /* swap what you're carrying for what's here */ }
      else if (!this.car && !this.ride && this.useLadder()) { /* up against a wall, or taken down */ }
      else if (!this.car && this.trainUse()) { /* on a train bound for another town (railway.ts) */ }
      else this.useVehicle();
    }
    // (a door found in a square that's just loaded goes on the maps)
    if (+this.mineTour.update(now / 1000) | +this.deliDoor.update(now / 1000)) {
      this.minimap.spots = [this.mineTour.spot(), this.deliDoor.spot()].filter((s) => !!s);
      const out = this.upFrom === "deli" ? this.deliDoor.outside() : this.upFrom ? this.mineTour.outside() : undefined;
      if (out && this.alive && !this.ride) { this.player.spawn(out.x, out.z, out.yaw); this.landing = null; this.upFrom = null; this.sendState(); }
    }
    this.breakdown.update(dt, now / 1000, p.pos.x, p.pos.y, p.pos.z);
    this.quests.update(dt, now / 1000);
    this.invasion.update(dt);
    this.updateDaily();
    this.land(dt);
    if (this.askedCar >= 0 && now - this.askedAt > 6000) this.askedCar = -1;   // no answer from the host
    const car = this.car, ride = this.ride;
    const helm = this.alive && !ride ? this.world.canal?.helmOf(this.net.selfId) ?? null : null;
    if (!helm && this.helmWas !== null) this.letGo();
    this.helmWas = helm ? helm.n : null;
    if (car || ride || helm || this.basket) p.ladder = null;
    if (!ride && !helm) this.carry();
    if (car) this.driveCar(dt, car);
    else if (ride) this.rideAlong(ride.seat, ride.v);
    else if (helm) this.atTiller(dt, helm);
    else if (this.basket) this.inBasket();
    else {
      p.ladders = this.alive ? [...this.ladders.near(p.pos.x, p.pos.z), ...abbeyLadders(this.map, p.pos.x, p.pos.z)] : [];
      if (!this.alive || (p.ladder && !p.ladders.some((L) => L === p.ladder))) p.ladder = null;   // taken down from under you
      const held = this.quests.held();   // on a race's start line in the countdown: held still
      p.update(dt, this.active && this.alive && !lining && !filming && !held);
      if (held) { p.pos.x = held.x; p.pos.z = held.z; p.vel.x = p.vel.z = 0; p.rideV = 0; }
      if (p.crashed) this.crash(p.crashed, p.crashWall);
      p.applyToCamera(this.camera);
      // the sniper's scope wanders, and the shot goes where it points
      this.camera.rotation.y += w.drift.x;
      this.camera.rotation.x += w.drift.y;
    }
    this.footsteps(dt);
    p.assist = this.freeMode;
    const onRide = this.riding && this.alive && !car && !ride && !helm && !this.basket;
    this.rideTricks.update(dt, p, onRide ? this.held : null, onRide ? this.camera : null);
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
    else if (this.active && this.alive && (this.firing || this.shootOnce) && !p.sprinting && !lining && !this.sports.lining && !filming && !car && !helm) this.shoot();
    this.shootOnce = false;
    if ((this.sinceShot += dt) > KICK_WAIT) p.settle(dt);
    this.boostT = Math.max(0, this.boostT - dt);
    // seagull muck slows you down (gulls.ts)
    this.slowT = Math.max(0, this.slowT - dt);
    p.speedMul = this.slowT > 0 ? 0.55 : 1;
    // tummy time counts towards a baby's bonnet
    if (this.alive && p.prone > 0.8 && (this.tummyT += dt) >= 10) { if (wardCount("tummy", this.tummyT) >= 600) earn("bonnet"); this.tummyT = 0; }
    const look = this.lastLook;
    // stood about doing nothing for a while: say something, and again every minute or so after
    const idle = this.active && this.alive && p.speed < 0.2 && !this.firing && !look.dx && !look.dy;
    this.idleT = idle ? this.idleT + dt : 0;
    if (this.idleT > IDLE_LINE) { Quips.idle(); this.idleT = IDLE_LINE - 60; }
    w.update(dt, this.camera, this.aiming && this.alive, p.bob, p.speed, p.sprinting, p.crouch, look.dx, look.dy, this.voice.mode === 2 && this.alive);
    // a reload cut short (a weapon switch, a pickup) stops sounding like one
    if (this.reloadSound && w.reloading <= 0) { this.reloadSound.stop(); this.reloadSound = null; }
    const tv = this.broadcast.on;
    this.wings.update(dt, p, this.camera, this.alive && !car && !ride && !helm && !this.basket);
    w.model.visible = this.alive && !this.wings.on && !this.scoped && !this.sports.lining && this.bino < 0.5 && !tv && !car && !helm;
    if (this.scoped || this.bino >= 0.5 || tv || car || helm) w.radioHand.visible = false;
    // on a bike, a BMX or a scooter, its handlebars in front of you
    const barsOf = this.riding && this.held && (this.held === "bike" || this.held === "bmx" || this.held === "scooter") ? this.held : null;
    const steer = Math.atan2(Math.sin(p.yaw - p.heading), Math.cos(p.yaw - p.heading));
    w.handlebars(w.model.visible && !ride && p.tumble <= 0 ? barsOf : null, this.camera, p.heading, steer, p.speed, dt);
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

    this.pickups.update(dt);
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
      r.avatar.base = r.cab ? this.world.cableway?.cabinAt(r.cab) ?? null : null;
      r.avatar.update(now, dt);
    }
    this.drawRides(dt);
    this.engineSounds();
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
    for (const c of this.naughtyBoys.living()) walkers.push({ id: c.key, x: c.x, y: c.y, z: c.z, alive: true });
    for (const c of this.cats.living()) walkers.push({ id: c.key, x: c.x, y: c.y, z: c.z, alive: true });
    const bendy = this.bendy.living();
    if (bendy) walkers.push({ id: bendy.key, x: bendy.x, y: bendy.y, z: bendy.z, alive: true });
    this.blood.update(dt, walkers);
    // the traffic: the host drives it round everyone, stopping for people, naughty boys and vehicles in the road
    if (host) {
      const people: Obstacle[] = walkers.filter((w) => w.alive).map((w) => ({ x: w.x, z: w.z, r: 0.4, id: w.id, person: !w.id.includes(".") && this.entry(w.id).alive }));
      for (const v of this.vehicles.list) people.push({ x: v.x, z: v.z, r: v.hl, id: v.driver, person: false, parked: !v.driver && Math.abs(v.speed) < 0.5, a: v.a });
      people.push(...this.breakdown.obstacles());
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
    const focus = tv ? this.broadcast.look : p.pos;
    // (the host also loads the streets round everyone else, to run the traffic and the rest there)
    this.world.update(focus.x, focus.y, focus.z, dt, host ? [...this.remotes.values()].map((r) => ({ x: r.avatar.x, z: r.avatar.z })) : undefined);
    // after dark (or in a tunnel), the traffic and anything being driven have their lights on
    this.lit.length = 0;
    this.traffic.lit(this.lit);
    for (const v of this.vehicles.list) { const l = v.lit; if (l) this.lit.push(l); }
    this.headlights.update(this.lit, this.camera.position, nightNow(), this.world.tunnel, dt);
    this.torches.update(this.camera, this.torchOn && this.alive, [...this.remotes.values()].filter((r) => r.torch && r.avatar.alive && r.avatar.root.visible)
      .map((r) => { const a = r.avatar; return { x: a.x, y: a.y + EYE + (CROUCH_EYE - EYE) * a.crouch + (PRONE_EYE - EYE) * a.prone, z: a.z, yaw: a.yaw, pitch: a.pitch }; }));
    if (!this.active) this.voice.radio(false);   // paused: let go of the radio
    if (this.voice.mode !== this.sentTalk) this.sendState();   // tell listeners straight away
    for (const r of this.remotes.values()) { r.avatar.talking = this.voice.speaking(r.id); r.avatar.onRadio = this.voice.modeOf(r.id) === 2; }
    const cam = this.camera.position, fwd = this.camera.getWorldDirection(new THREE.Vector3());
    this.voice.update(cam.x, cam.y, cam.z, fwd.x, fwd.y, fwd.z, (id) => this.posOf(id));

    if (!this.alive) {
      this.deadFor += dt;
      if (this.deadFor >= RESPAWN_SECONDS) this.respawn();
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
    this.sports.update(dt * this.broadcast.scale, p, this.alive && !this.ride, on ? { turn, power, kick, leave: this.leaveKey } : { turn: 0, power: 0, kick: false, leave: false });
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
    if (this.alive && p.landed) SFX.land(hard, Math.min(1, (p.landed - 3) / 12));
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
    for (const r of this.remotes.values()) if (r.avatar.alive) mates.push({ x: r.avatar.x, z: r.avatar.z, yaw: r.avatar.yaw, colour: r.colour, name: r.name, firing: now - r.lastShot < 2000 });
    // naughty boys nearby: white if they're after someone, grey if they're hanging about
    let chased = -1;   // the kind of gang after you, if any
    for (const c of this.naughtyBoys.living()) {
      const d = Math.hypot(c.x - p.pos.x, c.z - p.pos.z);
      if (d > 90) continue;
      blips.push({ x: c.x, z: c.z, colour: c.target ? "#f4f4f4" : "#8f949a", layer: "people" });
      if (c.target === this.net.selfId && d < 60 && chased < 0) chased = c.kind;
    }
    // cats out for blood show up orange
    for (const c of this.cats.living()) if (c.target && Math.hypot(c.x - p.pos.x, c.z - p.pos.z) < 90) blips.push({ x: c.x, z: c.z, colour: "#ff9a2a", layer: "people" });
    // Bendy: a marker of his own on the maps, and his health across the top of the screen while he's near
    const bendy = this.bendy.at(), up = bendy.state === 1, bd = Math.hypot(bendy.x - p.pos.x, bendy.z - p.pos.z);
    this.minimap.boss = this.bendy.living() && bd < 300 ? { x: bendy.x, z: bendy.z, after: !!this.bendy.target } : null;
    const boss = $("boss");
    boss.hidden = !(up && (bd < 120 || this.bendy.target === this.net.selfId));
    let bossName = "Bendy", bossFill = (100 * bendy.hp) / BENDY_HP;
    if (boss.hidden) {
      // or the Chair, or a Wanted ringleader, when you're close
      for (const c of this.naughtyBoys.living()) {
        const at = this.naughtyBoys.at(c.i);
        if (!at || !(at.boss || at.kind === CHAIR) || Math.hypot(c.x - p.pos.x, c.z - p.pos.z) > 90) continue;
        bossName = at.kind === CHAIR ? this.invasion.bossName(at.kit) : this.quests.bossName() || "The ringleader";
        bossFill = (100 * at.hp) / Math.max(1, at.top);
        boss.hidden = false;
        break;
      }
    }
    const jobBoss = boss.hidden ? this.quests.bossBar() : null;
    if (jobBoss) { bossName = jobBoss.name; bossFill = 100 * jobBoss.fill; boss.hidden = false; }
    if (!boss.hidden) {
      $("bossfill").style.width = `${bossFill}%`;
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
    this.minimap.jobs = this.quests.spots();
    this.minimap.circles = this.quests.areas();
    this.minimap.tint = this.invasion.tint();
    this.minimap.markers = this.markerList();
    this.markers.update(now / 1000, p.pos.x, p.pos.z);
    const compass = $("compass") as HTMLCanvasElement;
    compass.hidden = !this.markers.size;
    if (!compass.hidden) drawCompass(compass, p.pos.x, p.pos.z, p.yaw, this.minimap.markers);
    this.minimap.draw(p.pos.x, p.pos.z, p.yaw, blips, mates);
    if (!$("bigmap").hidden) this.minimap.drawFull($("bigmapcanvas") as HTMLCanvasElement, p.pos.x, p.pos.z, p.yaw, blips, mates);
    $("hpnum").textContent = String(Math.ceil(this.hp));
    $("health").classList.toggle("low", this.alive && this.hp <= 30);
    const fill = $("hpfill");
    fill.style.width = `${this.hp}%`;
    fill.style.background = this.hp > 60 ? "var(--ok)" : this.hp > 30 ? "var(--accent)" : "var(--danger)";
    const gun = w.gun, fists = w.kind === "fists", sniper = w.kind === "sniper";
    $("ammolabel").textContent = ammoLabel(w.kind);
    $("ammonum").textContent = fists ? "–" : String(w.rounds);
    $("ammomax").textContent = fists ? "" : `/ ${sniper ? w.sniperReserve : w.reserve}`;
    $("magfill").style.width = fists ? "0%" : `${(w.rounds / gun.mag) * 100}%`;
    $("ammo").style.setProperty("--segs", String(gun.mag || 1));
    $("ammo").classList.toggle("low", !fists && w.rounds <= (sniper ? 2 : 6));
    $("reloadmsg").textContent = fists ? (w.has("rifle") ? "Press 2 for the rifle" : w.has("sniper") ? "Press 3 for the sniper" : "Out of ammo: find some rounds")
      : sniper ? (w.reloading > 0 ? "Reloading…" : w.sniperAmmo === 0 ? (w.sniperReserve ? "Press R to reload" : "Out of sniper rounds")
        : w.rechambering ? "Working the bolt…" : w.sniperAmmo === 1 ? "Last round" : w.sniperAmmo === 2 ? "2 rounds left" : "")
      : w.reloading > 0 ? "Reloading…" : w.ammo === 0 ? (w.reserve ? "Press R to reload" : "Out of ammo")
      : w.ammo <= 6 ? "Low ammo" : w.reserve === 0 ? "No spare rounds" : "";
    $("scope").hidden = !this.scoped || !this.alive;
    $("binoculars").hidden = this.bino < 0.85 || !this.alive;
    $("t-bino").classList.toggle("latched", this.binoculars);
    $("t-aim").classList.toggle("latched", this.aiming);
    $("t-crouch").classList.toggle("latched", p.crouchLatch || p.proneLatch);
    const crouchText = p.proneLatch ? "Tummy" : "Crouch";
    say($("t-crouch"), crouchText);
    const gap = 4 + w.spread(Math.min(1, p.speed / 5), !p.onGround) * 700;
    const ch = $("crosshair");
    ch.style.setProperty("--gap", `${gap.toFixed(1)}px`);
    ch.style.opacity = w.aim > 0.6 || this.bino > 0.3 || p.sprinting || !this.alive || this.sports.lining || this.car ? "0" : "1";
    // aiming the paintball marker: its red dot, square in the middle where the paint goes
    $("reddot").hidden = !(w.kind === "rifle" && !gore() && w.aim > 0.6 && w.model.visible);
    this.driveHud();
    const lining = this.sports.lining;
    $("kick").hidden = !lining;
    if (lining) {
      const pw = this.sports.power;
      $("kickfill").style.width = `${Math.round(pw * 100)}%`;
      $("kickfill").style.background = `hsl(${Math.round((1 - pw) * 120)}, 85%, 50%)`;
      const bowl = this.sports.sport === "c";
      $("kicklabel").textContent = bowl ? "Bowling · pace" : "Kick at goal · power";
      // the wind: which way it's blowing, from where you're facing (up the screen is straight ahead)
      const wind = this.sports.wind, mph = wind ? Math.round(wind.length() * 2.237) : 0;
      $("wind").textContent = mph ? `Wind ${mph} mph` : "No wind";
      $("windarrow").hidden = !mph;
      if (wind && mph) {
        const yaw = p.yaw, ahead = -wind.x * Math.sin(yaw) - wind.z * Math.cos(yaw), right = wind.x * Math.cos(yaw) - wind.z * Math.sin(yaw);
        $("windarrow").style.transform = `rotate(${Math.atan2(right, ahead)}rad)`;
      }
      $("kickhint").textContent = this.freeMode ? `Stick: aim and ${bowl ? "pace" : "power"} · Fire to ${bowl ? "bowl" : "kick"} · Jump to walk off`
        : `A/D aim · W/S ${bowl ? "pace" : "power"} · Space to ${bowl ? "bowl" : "kick"} · E to walk off`;
    }
    $("hud").classList.toggle("tv", this.broadcast.on);
    if (this.broadcast.on) say($("caption"), this.broadcast.caption);
    $("boost").hidden = this.boostT <= 0 || !this.alive;
    if (this.boostT > 0) $("boost").textContent = `Lucozade: double damage ${Math.ceil(this.boostT)}s`;
    this.hitT -= dt;
    $("hitmarker").style.opacity = this.hitT > 0 ? "1" : "0";
    this.hurtT -= dt;
    $("vignette").style.opacity = String(Math.max(0, this.hurtT * 2, this.hp < 35 && this.alive ? 0.35 : 0));
    const death = $("death");
    death.hidden = this.alive;
    if (!this.alive) {
      $("deathby").textContent = this.killer;
      $("deathcount").textContent = `Respawn in ${Math.max(1, Math.ceil(RESPAWN_SECONDS - this.deadFor))}…`;
    }
    const n = this.remotes.size + 1, where = mapName(this.mapId);
    $("roominfo").textContent = this.net.kind === "local" && this.room === "SOLO"
      ? `Practice · ${where} · on your own`
      : `Room ${this.room} · ${where} · ${n} player${n === 1 ? "" : "s"}${this.isHost ? " · you're hosting" : ""}`;
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
      const edge = this.map.fieldEdge(p.pos.x, p.pos.z);
      const where = $("where");
      where.textContent = edge < 25 ? "Force field: you can't go further" : best;
      where.classList.toggle("warn", edge < 25);
    }
  }

  /** The vehicle you're driving and how fast, or the prompt to get in one. */
  private driveHud() {
    const car = this.car, ride = this.ride, canal = this.world.canal, me = this.net.selfId;
    const helm = canal?.helmOf(me) ?? null;
    $("drive").hidden = !car && !helm;
    $("ammo").hidden = !!car || !!helm;
    if (helm) {
      $("drivename").textContent = `${helm.name}, narrowboat`;
      $("mph").textContent = String(Math.round(Math.abs(helm.v) * 2.237));
      $("drivehint").textContent = this.freeMode ? "Stick: throttle and tiller · Car: let go" : "W/S throttle · A/D tiller · E to let go";
    }
    if (car) {
      const horn = car.kind === "police" ? "siren" : car.kind === "icecream" ? "chimes" : "horn";
      $("drivename").textContent = car.name;
      $("mph").textContent = String(Math.round(Math.abs(car.speed) * 2.237));
      $("drivehint").textContent = car.tip ? (this.freeMode ? "Car to get out" : "E to get out")
        : this.freeMode ? `Stick: drive · Jump: handbrake · Fire: ${horn} · Car: get out` : `W/S drive · A/D steer · Space handbrake · H ${horn} · E out`;
    }
    const free = !ride && this.alive && !this.sports.lining && !this.broadcast.on;
    const near = free ? this.nearCar() : null, stop = free && !near ? this.stopNear() : null;
    const tour = !ride && this.alive && this.mineTour.near(this.player.pos.x, this.player.pos.z, this.player.pos.y);
    const deli = !ride && this.alive && !tour && this.deliDoor.near(this.player.pos.x, this.player.pos.z, this.player.pos.y);
    if (stop !== this.busStop) this.busMenu = 0;   // walked off: the menu goes
    const menu = !!stop && this.busMenu > performance.now();
    const verb = near?.t !== undefined ? "Nick" : near?.driver ? "Ride in" : "Get in";
    const pp = this.player.pos;
    const tiller = free && !near && !helm && canal ? canal.tillerNear(pp.x, pp.y, pp.z, me) : null;
    const lock = free && !near && !helm && !tiller && canal ? canal.lockNear(pp.x, pp.z) : -1;
    const job = !ride && !tour && !deli ? this.quests.hint() : "";
    // something new in your hands: say what to do with it, for a moment
    const slotNow = this.carrying();
    if (slotNow !== this.tipSlot) { this.tipSlot = slotNow; if (slotNow) this.rideTip = performance.now() + TIP_MS; }
    const ladder = !ride && !this.riding && this.alive ? this.ladderHint() : "";
    // at a platform by a train with its doors open: say where it goes and get on with E
    const board = !ride && !near && !tour && !deli && this.alive ? this.world.railway?.boardingAt(pp.x, pp.z, pp.y) ?? null : null;
    const boardLink = board ? (this.world.railway!.d.links ?? []).find((l) => l.line === board.route.name) : undefined;
    const train = board && boardLink ? `<b>${this.freeMode ? "Car" : "E"}</b> Board the ${esc(boardLink.to_station)} train` : "";
    const slot = this.carrying(), sw = !ride && this.alive ? this.swapAt?.kind : undefined;
    const named = (k: RideKind | "ladder") => (k === "ladder" ? "the ladder" : esc(rideSpecs[k].name));
    const swap = sw && slot && (isRide(sw) || sw === "ladder") ? `Swap ${named(slot).replace(/^(an?|the) /, "your ")} for ${named(sw)}` : "";
    const text = tour ? `<b>${this.freeMode ? "Car" : "E"}</b> Go in for a mine tour`
      : deli ? `<b>${this.freeMode ? "Car" : "E"}</b> Work a shift in the deli kitchen`
      : train ? train
      : job ? (this.freeMode ? job.replace("<b>E</b>", "<b>Use</b>") : job)
      : near ? `<b>${this.freeMode ? "Car" : "E"}</b> ${verb} the ${esc(near.name)}`
      : tiller ? `<b>${this.freeMode ? "Use" : "E"}</b> Take the tiller of ${esc(tiller.name)}`
      : lock >= 0 ? `<b>${this.freeMode ? "Use" : "E"}</b> ${esc(canal!.lockHint(lock))}`
      : menu ? `<button data-bus="minibus"><b>1</b> Minibus</button> <button data-bus="bus"><b>2</b> Double-decker</button>`
      : stop ? `<b>${this.freeMode ? "Bus" : "E"}</b> Call a bus`
      : ride && !car ? `Riding in the ${esc(ride.v.name)} · <b>${this.freeMode ? "Car" : "E"}</b> to get out`
      : this.basket ? `In the trolley · <b>${this.freeMode ? "Use" : "E"}</b> to climb out`
      : swap ? `<b>${this.freeMode ? "Use" : "E"}</b> ${swap}`
      : this.riding && this.held && performance.now() < this.rideTip ? `On ${esc(rideSpecs[this.held].name)} · <b>${this.freeMode ? "Ride" : "X"}</b> to get off${this.freeMode ? "" : ` · ${esc(rideSpecs[this.held].keys)}`}`
      : this.held && performance.now() < this.rideTip ? `<b>${this.freeMode ? "Ride" : "X"}</b> Get on ${esc(rideSpecs[this.held].name)}`
      : ladder;
    show($("usehint"), text, !!text);
    // the one thing you carry (a ride or a ladder), all the time, with its icon, over your rounds
    // (the middle of the screen only says what to do with it for a moment: the keys stay here, small)
    const lad = !this.held && this.alive && this.ladders.carriers.has(me);
    const what = this.held ? esc(rideSpecs[this.held].name.replace(/^an? /, "")) : "";
    const rk = this.freeMode ? "Ride" : "X";
    const words = lad ? `Got: ladder<small><b>${rk}</b> facing a wall to put it up</small>`
      : !this.held ? "" : this.riding ? `Riding: ${what}<small><b>${rk}</b> to get off</small>` : `Got: ${what}<small><b>${rk}</b> to get on</small>`;
    const chip = !words ? "" : `<span class="carryicon">${carryIcon(lad ? "ladder" : this.held!)}</span><span class="carrywords">${words}</span>`;
    show($("ridechip"), chip, !!chip);
    const jobUse = job.includes("<b>E</b>");
    const ladderUse = ladder.startsWith(`<b>${this.freeMode ? "Use" : "E"}</b>`);
    $("t-car").hidden = !ride && !near && !tour && !deli && !train && !stop && !helm && !tiller && lock < 0 && !jobUse && !ladderUse && !swap;
    $("t-ride").hidden = (!this.held && !lad) || !!ride || !!this.basket;
    $("t-ride").textContent = this.riding ? "Get off" : lad ? "Put up" : "Ride";
    $("t-trick").hidden = !this.riding || !!ride || !this.held || !rideSpecs[this.held].grind;
    $("t-car").textContent = ride ? "Get out" : helm ? "Let go" : tour || deli ? "Go in" : train ? "Board" : jobUse ? "Use" : near ? "Get in" : swap && !stop ? "Swap" : tiller || lock >= 0 || (ladderUse && !stop) ? "Use" : "Bus";
  }

  /** What there is to do with a ladder here: on one, by the foot of one, or carrying one. */
  private ladderHint(): string {
    const p = this.player, use = this.freeMode ? "Use" : "E", put = this.freeMode ? "Ride" : "X";
    if (p.ladder) return this.freeMode ? "On the ladder · Stick to climb · Jump to let go" : "On the ladder · W to climb, S to go down · Space to let go";
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
        if (d < 5) noteDaily("ride", d);   // a jump to a start line or a respawn doesn't count
      }
      this.rideFrom = { x: p.pos.x, z: p.pos.z };
    } else this.rideFrom = null;
    const board = $("scoreboard");
    // by the clock rather than frames, so a slow machine doesn't keep it up for longer
    if (this.dailyT < 0 && this.active) { this.dailyT = performance.now() + 12000; board.classList.add("join"); board.hidden = false; }
    if (this.dailyT > 0 && performance.now() > this.dailyT) { this.dailyT = 0; board.hidden = true; board.classList.remove("join"); }
    if (!board.hidden) this.daily.draw($("daily"));
    if (!$("pause").hidden) this.daily.draw($("pausedaily"));
  }

  /** Today's jobs on the pause screen. */
  drawDaily() { this.daily.draw($("pausedaily")); }

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

  toast(text: string, secs = 2) {
    $("toast").textContent = text;
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
      pubs: () => this.pubList.map((q) => ({ name: q.name, x: q.x, z: q.z, rating: q.rating })),
      places: () => {
        const out: { n: string; x: number; z: number }[] = [];
        for (const p of [...this.map.d.pl ?? [], ...this.map.wide?.d.pl ?? []]) {
          if (!p.n || p.r.length < 3) continue;
          const x = p.r.reduce((s, q) => s + q[0], 0) / p.r.length, z = -p.r.reduce((s, q) => s + q[1], 0) / p.r.length;
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
      hear: (x, y, z) => this.hear(x, y, z),
      manual: () => (this.riding && this.alive ? this.player.manual : 0),
    };
  }

  /** leave: true (the default) also drops the connection, for closing the game. Travelling passes
   *  false: only this map's world is torn down, and the voice links and the room stay. */
  dispose(leave = true) {
    this.unEarn();
    this.wings.dispose();
    this.quests.dispose();
    this.invasion.dispose();
    this.daily.dispose();
    Quips.hush();
    for (const e of this.engines.values()) e.stop();
    for (const e of this.trainEngines.values()) e.stop();
    for (const r of this.rushes.values()) r.stop();
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
