// Who's who (characters.html): everyone you meet on the streets of Bath, one at a time on a turntable,
// to look at from every side. Players come in any of the game's colours and can be dressed in
// anything from the wardrobe (wardrobe.ts), earned or not; the gangs (naughtyboys.ts) come in every
// kit, with the ringleaders and the Flag Lads' bosses; the cats (cats.ts) in every breed and coat;
// the gulls, Big Lad and the tourists from Seagull Attack (gulls.ts); Bendy (bendy.ts), and by day (daybendy.ts); Jamie Mair
// (jamie.ts); the prefects, lab coats and guy from Get Wood (bonfire.ts); and everyone else about Bath. A second tab, Under Combe Down, has every monster and boss in the mines (mines/mobviews.ts),
// in the dark with a lamp, as champions and mini-bosses, and the bosses doing each of their moves. A third, Vehicles, has everything you can
// drive or ride (vehicles.ts, rides.ts), the trains, the cable car, the balloons and the narrowboats, in their colours.
//
// Who decides what: nothing here goes over the network or touches what you've earned. It draws
// the game's own models, built by the same code the game uses, so what you see is what's in the game.
import * as THREE from "three";
import { Avatar, COLOURS } from "./avatar";
import { Figure as CatFigure, coatsOf } from "./cats";
import { BOSS, CHAIR, CRICKET, FLEE, Figure, GIRL, KITS, LADDER, LOUD, NAUGHTY, OFF_SECS, RUGBY, SOCIETY, look, withLoud } from "./naughtyboys";
import { SLOTS, WEARABLES, type Slot } from "./wardrobe";
import { BOSS_SCALE, gullFigure, touristOnBench } from "./gulls";
import { Figure as BendyFigure } from "./bendy";
import { Owner, type Mood } from "./breakdown";
import { Figure as JamieFigure } from "./jamie";
import { guy, labCoat, prefect } from "./bonfire";
import { boaterGeometry } from "./canal";
import { figure as statue } from "./landmarks/kit";
import { MobView, type MobKind } from "./mines/mobviews";
import { KINDS, MOBS, MINI } from "./mines/mobs";
import { BOSSES, MINI_NAMES, MOVE, WEAK_HINT } from "./mines/bosses";
import { WEAKNESS } from "./mines/gen";
import { Vehicle, SPECS, MAKES, type VKind } from "./vehicles";
import { CAR_PAINT } from "./furniture";
import { GOLF, LAND_ROVER, PARAMOUNT, ALIZEE, XR3I } from "./makes";
import { trainModels } from "./railway";
import { cabinModel } from "./cableway";
import { BALLOON_DESIGNS, balloonModel } from "./balloons";
import { BOAT_PAINTS, boatGeometry } from "./canal";
import { RIDES, rideModel, rideSpecs } from "./rides";

type Kind = "player" | "gang" | "cat" | "gull" | "tourist" | "bendy" | "owner" | "still" | "mob" | "vehicle";
/** size: roughly how tall it stands, to frame it (a person is 1.8). */
/** mines: on the Under Combe Down tab. mob, mini: which monster, and whether it's the mini-boss. moves: a boss's special moves. */
interface Entry { name: string; blurb: string; kind: Kind; group: string; mines?: boolean; mob?: MobKind; mini?: boolean; moves?: number[]; look?: number; kits?: string[]; loud?: number; size?: number; head?: string; scale?: number; build?: () => THREE.Object3D;
  /** A vehicle: the paints it comes in (colours), or how many looks it has, and the everyday cars' makes (numbers into MAKES). Its build is given the paint and the make. */
  paints?: string[]; looks?: number; makes?: number[]; fresh?: boolean; make?: (paint: string, look: number, make: number) => THREE.Object3D }

const kits = (names: string[]) => names;
const ENTRIES: Entry[] = [
  { group: "Players", kind: "player", name: "A player", blurb: "You, and everyone you play with: a jacket in your own colour, and whatever you've earned from the wardrobe." },
  { group: "Gangs", kind: "gang", name: "Naughty boy", blurb: "Trackies, a cap and a chain. Runs faster than you walk; shoot one and he comes for you.", look: look(NAUGHTY, 0) },
  { group: "Gangs", kind: "gang", name: "Ringleader", blurb: "A job's ringleader: a size bigger, a chunky gold chain, and he hits harder.", look: look(NAUGHTY, 0) + BOSS },
  { group: "Gangs", kind: "gang", name: "Wanted ringleader", blurb: "A Wanted man wears one loud thing so you can pick him out of a crowd.", look: look(NAUGHTY, 0) + BOSS, loud: 1 },
  { group: "Gangs", kind: "gang", name: "Rugby team", blurb: "Hooped jerseys, bigger and quicker and harder to put down. They turn out near their pitches and outside the pubs.", look: look(RUGBY, 0),
    kits: kits(["Navy and white", "Maroon and gold", "Green and white", "Black and gold", "Blue and black", "Red and black"]).slice(0, KITS[RUGBY]) },
  { group: "Gangs", kind: "gang", name: "Cricket team", blurb: "In their whites, swinging bats, which reach further than a fist.", look: look(CRICKET, 0),
    kits: kits(["Navy and red", "Maroon and gold", "Green and gold", "Purple and gold", "Navy and gold"]).slice(0, KITS[CRICKET]) },
  { group: "Gangs", kind: "gang", name: "Naughty girl", blurb: "Out on a Friday or Saturday night at the top of Milsom Street: a short skirt, heels and a handbag. She slaps, says what she thinks of you, and kicks off with anyone, her own lot included.", look: look(GIRL, 0),
    kits: kits(["Pink top, black skirt", "Little black dress", "Red dress", "White top, gold skirt", "Turquoise top, white skirt", "Silver top, black skirt"]).slice(0, KITS[GIRL]) },
  { group: "The Flag Lads", kind: "gang", name: "Flag lad", blurb: "England shirts, some with the flag worn as a cape. They only turn up at the pubs they've taken over.", look: look(SOCIETY, 0),
    kits: ["White shirt, jeans", "White shirt and cape, shorts", "Red away shirt", "White shirt and cape, black jeans"] },
  { group: "The Flag Lads", kind: "gang", name: "Ladder lad", blurb: "Hi-vis and a ladder: puts cleared flags back up, and runs from you rather than fight.", look: look(LADDER, 0),
    kits: ["White shirt", "White shirt, shorts", "Red away shirt", "White shirt, black jeans"] },
  { group: "The Flag Lads", kind: "gang", name: "The Gaffer", blurb: "Runs the takeover: wax jacket over his England shirt, a flag bucket hat and a megaphone.", look: look(CHAIR, 0) },
  { group: "The Flag Lads", kind: "gang", name: "His right-hand man", blurb: "Black bomber, hi-vis armband, shades. The Gaffer can't be hurt till he's down.", look: look(CHAIR, 1) },
  { group: "The Flag Lads", kind: "gang", name: "The Gaffer's cousin", blurb: "Runs the second takeover when a big room gets two: a gilet over the red away shirt, and a flat cap.", look: look(CHAIR, 2) },
  { group: "Seagull Attack", kind: "gull", name: "Herring gull", blurb: "The gulls of Bath: hoverers, swoopers, walkers and poopers, all after the tourists' sandwiches.", head: "#f4f4f2", scale: 1.6, size: 0.9 },
  { group: "Seagull Attack", kind: "gull", name: "Black-headed gull", blurb: "Smaller and quicker, with a dark hood.", head: "#3a3030", scale: 1.25, size: 0.7 },
  { group: "Seagull Attack", kind: "gull", name: "Big Lad", blurb: "The last wave: about 12 m wing tip to wing tip. He perches on the rooftops, dive-bombs and calls in a gang.", head: "#f4f4f2", scale: BOSS_SCALE, size: 7 },
  { group: "Seagull Attack", kind: "tourist", name: "Tourist", blurb: "Sat on a bench with a sandwich from the Darling Deli, a bucket hat and a camera. Keep the gulls off it.", size: 1.4 },
  { group: "Seagull Attack", kind: "tourist", name: "Hen party", blurb: "One of the tourists on a hen do: pink, with a sash, and six sandwiches.", size: 1.4 },
  { group: "Bosses", kind: "bendy", name: "Bendy", blurb: "Four metres of black, rubbery limbs with a lamp in his forehead, at the top of Bath. Get caught in the beam and he comes for you.", size: 4.2 },
  { group: "Round Bath", kind: "owner", name: "The breakdown man", blurb: "On Bathwick Street, his BMW dead at the kerb: pacing in his gilet, on the phone, telling anyone who comes near.", size: 1.9 },
  { group: "Round Bath", kind: "still", name: "Jamie Mair", blurb: "Up on Lansdown having a crafty smoke: at the top of Van Diemen's Lane, or in the bushes by Kingswood's chapel. Go up to him and he'll give you one: for a minute nothing can hurt you and you hit twice as hard.", size: 1.95,
    build: () => { const f = new JamieFigure(); f.pose(0, 0, 0, 0, 3, 0.5); return f.root; } },
  { group: "Round Bath", kind: "still", name: "Day Bendy", blurb: "Bendy's other life, at an ordinary size: by day he's a history teacher at Grenville's monument on Lansdown, telling the school trip about the Battle of Lansdown.", size: 1.95,
    build: () => { const f = new BendyFigure(new THREE.Scene()); f.pose(0, 0, 0, 0, 0, 0, 0, 1, 0, false, 0.5); f.root.scale.multiplyScalar(0.45); f.root.removeFromParent(); f.root.visible = true; return f.root; } },
  { group: "Get Wood", kind: "still", name: "Prefect", blurb: "Kingswood's prefects, in their suits and the school tie. While there's wood to fetch for the bonfire they follow you about and tell you to hurry up. They never carry any.", size: 1.95,
    build: () => prefect(0).root },
  { group: "Get Wood", kind: "still", name: "Lab coat", blurb: "Out of Westwood on bonfire night with sparklers, to stand round the fire and set the fireworks off.", size: 1.95,
    build: () => { const { p } = labCoat(1); p.arms[1].rotation.x = 1.3; p.fores[1].rotation.x = 0.55; return p.root; } },
  { group: "Get Wood", kind: "still", name: "The guy", blurb: "Sat on top of the bonfire once it's built, in old clothes stuffed with straw. He goes up with it.", size: 1.4,
    build: () => { const g = guy(); g.root.position.y = 0.9; return g.root; } },
  { group: "Round Bath", kind: "still", name: "Narrowboat crew", blurb: "At the tiller of the boats chugging along the Kennet and Avon.", size: 1.9,
    build: () => new THREE.Mesh(boaterGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true })) },
  { group: "Round Bath", kind: "still", name: "A witness", blurb: "Someone in a mac who saw the Wanted man go by, under a faint red beam.", size: 1.7,
    build: () => { const g = new THREE.Group(), skin = new THREE.MeshLambertMaterial({ color: "#e6bd9f" });
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 1.3, 10).translate(0, 0.65, 0), new THREE.MeshLambertMaterial({ color: "#a08a5a" })),
        new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8).translate(0, 1.47, 0), skin));
      return g; } },
  { group: "Round Bath", kind: "still", name: "Abbey angel", blurb: "The angels on the ladders up Bath Abbey's west front. Climb past one at the wrong moment and it knocks you off.", size: 2.2,
    build: () => new THREE.Mesh(statue(true), new THREE.MeshLambertMaterial({ color: "#cdbf9c" })) },
  { group: "Animals", kind: "cat", name: "Cat", blurb: "Bath's cats: most just sit about, but cross a swarm and they'll have you.", look: 0, size: 0.5,
    kits: ["Tabby", "Plain", "Tuxedo", "Siamese", "Calico and tortoiseshell", "Maine Coon", "Sphynx", "Persian", "Bengal", "Dyed"] },
  ...mineEntries(),
  ...vehicleEntries(),
];

type Tab = "streets" | "mines" | "vehicles";
const TAB_NAMES: Record<Tab, string> = { streets: "Bath", mines: "Under Combe Down", vehicles: "Vehicles" };
const tabOf = (e: Entry): Tab => (e.mines ? "mines" : e.kind === "vehicle" ? "vehicles" : "streets");

/** Everything you can drive, ride or travel in: the game's own models, and the colours each comes in. */
function vehicleEntries(): Entry[] {
  const vertexMesh = (g: THREE.BufferGeometry, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, ...extra }));
  // a vehicle that's going nowhere needs no map or ground
  const car = (kind: VKind, paint: string, label = "") => new Vehicle(0, kind, paint, null as never, () => 0, label).root;
  let trains: THREE.BufferGeometry[] | null = null;
  const trainCar = (k: number) => vertexMesh((trains ??= trainModels())[k]);
  const drive = (kind: VKind, blurb: string): Entry => ({ group: "You can drive", kind: "vehicle", name: SPECS[kind].name, blurb, paints: SPECS[kind].paint, make: (p) => car(kind, p) });
  const special = [LAND_ROVER, GOLF, XR3I, PARAMOUNT, ALIZEE];
  const rides: Record<string, string> = {
    bike: "Picked up off the street: the quickest thing on the roads, and hopeless on grass. Tuck down the hills.",
    bmx: "Hop kerbs and low walls, and tailwhip in the air. Picked up off the street.",
    blades: "Quick on the pavements, and they'll grind anything. Put them on with X.",
    board: "Picks up speed downhill; ollie, kickflip and grind the rails.",
    scooter: "A kick scooter: off the mark in no time, and it turns on a sixpence.",
    pogo: "Bounce over walls with it; time the bounce as you land for a bigger one.",
    trolley: "Push it about, hop on the back to hold on downhill, and a mate can ride in it.",
  };
  const unique = (list: string[]) => list.filter((c, k) => list.indexOf(c) === k);
  const list: Entry[] = [
    drive("bus", "Badgerline's number 2 to Combe Down, with a top deck. Get in with E; call one from a stop."),
    drive("minibus", "A Badgerline minibus, the smaller one on the back routes. Drive it, or ride in the back."),
    drive("school", "Kingswood School's own minibus, in white and navy, out on a school trip."),
    drive("paramount", "One of Arleen's coaches: long and heavy, slow off the mark and happy on the open road. Seats a crowd."),
    drive("alizee", "Arleen's other coach, the Van Hool: the same size, a different front end."),
    drive("xr3i", "The boy racer's Escort: quick and light. Get in with E."),
    drive("robin", "Three wheels and a lean: take a corner too hard and it goes over."),
    drive("nova", "A little Vauxhall. Light, quick, and everywhere in the traffic."),
    drive("metro", "An old Austin Metro, tinny and slow, in a very 1980s colour."),
    drive("sierra", "A big Sierra, the quickest of the ordinary cars."),
    drive("police", "A Sierra in police livery. Press H for the siren."),
    drive("transit", "A Ford Transit with room for your mates in the back."),
    drive("icecream", "The Mr Whippy van. Press H and it plays its chimes."),
    drive("chipvan", "Mr D's chip van, with its fryers in the back."),
    drive("milkfloat", "A milk float, whirring along at seven metres a second, with crates of bottles that smash."),
    drive("c5", "A Sinclair C5: one seat, almost on the road, and not much faster than a jog."),
    drive("roller", "A heavy roller, as slow as a walk, and it runs people over."),
    drive("landrover", "An old Land Rover, parked out in the country: as good on grass and fields as on the road."),
    drive("golf", "A Golf GTI, very nearly an XR3i. Every Golf about town is one."),
    { group: "Everyday cars", kind: "vehicle", name: "Everyday car", blurb: "Parked all over Bath and running in the traffic: pick a make and a colour. Every one can be driven off.",
      makes: MAKES.map((_, k) => k).filter((k) => !special.includes(k)), paints: CAR_PAINT, make: (p, _k, m) => car("car", p, MAKES[m]) },
    { group: "Trains", kind: "vehicle", name: "InterCity 125 power car", blurb: "On the main line through Bath Spa and Oldfield Park. Board at the station.", make: () => trainCar(0) },
    { group: "Trains", kind: "vehicle", name: "InterCity 125 coach", blurb: "A Mk3 coach: five of them between the two power cars.", make: () => trainCar(1) },
    { group: "Trains", kind: "vehicle", name: "Sprinter", blurb: "Two of these down the Limpley Stoke valley line, stopping everywhere.", make: () => trainCar(2) },
    { group: "Other ways about", kind: "vehicle", name: "Cable car cabin", blurb: "From Mulberry Park over Lyncombe Vale and Beechen Cliff to the river. Ride it, with its doors open at each end.", fresh: true,
      make: () => { const g = new THREE.Group(), geo = cabinModel();
        g.add(vertexMesh(geo.body), vertexMesh(geo.glass, { transparent: true, opacity: 0.28, depthWrite: false }));
        return g; } },
    { group: "Other ways about", kind: "vehicle", name: "Hot air balloon", blurb: "Up from Royal Victoria Park at dawn. Climb in with E: W for the burner, S for the vent.", fresh: true, looks: BALLOON_DESIGNS,
      make: (_p, k) => balloonModel(k) },
    { group: "Other ways about", kind: "vehicle", name: "Narrowboat", blurb: "Chugging along the Kennet and Avon, through the locks. Take the tiller.", fresh: true, looks: BOAT_PAINTS,
      make: (_p, k) => vertexMesh(boatGeometry(k)) },
    ...RIDES.map((k): Entry => ({ group: "Rides", kind: "vehicle", name: rideSpecs[k].name.replace(/^an? /, "").replace(/^./, (c) => c.toUpperCase()), blurb: rides[k], fresh: true, make: () => rideModel(k) })),
  ];
  return list.map((e) => (e.paints ? { ...e, paints: unique(e.paints) } : e));
}

/** Under Combe Down: every monster in the mines, the mini-bosses and the bosses at the bottom of each run. */
function mineEntries(): Entry[] {
  const BLURB: Partial<Record<MobKind, string>> = {
    rat: "Comes in packs. Fast, weak, everywhere.", bat: "Flies. Roosts in the headings and swoops.", ghoul: "A dead quarryman who never came up.",
    headless: "Big, slow, hits hard.", spider: "Hangs from the roof, then drops on you.", reaper: "Stands still like a dead tree until you get close.",
    gazer: "Floats, and shoots from range.", wisp: "Flickers about, blinks out and back, and shoots.", blob: "Splits when it dies.",
    golem: "A walking block of oolite. Very tough.", knocker: "A little mine spirit. Taps on the rock, then throws stones from the dark.",
    mimic: "Looks like a treasure chest until you open it.", puffcap: "A walking mushroom that bursts out choking spores.",
    centipede: "Long, fast and low. Comes out of cracks in packs of two.", beetle: "Glows like a coal and spits embers.",
    drowned: "Rises out of the water, slow and grabbing.", wight: "A frozen corpse that breathes rime.",
    wraith: "A shrouded ghost that drifts through the dark and strikes from nowhere.", troll: "Huge, stupid and very hard to put down.",
    crossbow: "A skeleton guard who still remembers how to shoot.",
    grout: "Boss of a Collapsed run.", engine: "Boss of a Flooded run.", wyrm: "Boss of a Burning run.", rime: "Boss of a Frozen run.", owner: "Boss of a Haunted run.",
  };
  const M = MOVE, MOVES: Partial<Record<MobKind, number[]>> = {
    grout: [M.SLAM, M.SHOCK, M.FROST, M.SUMMON, M.STUN], engine: [M.SLAM, M.STEAM, M.FLOOD, M.CHARGE, M.SUMMON, M.STUN],
    wyrm: [M.SWIPE, M.TAIL, M.BREATH, M.DIVE, M.UNDER, M.SURFACE, M.SUMMON, M.STUN], rime: [M.SWIPE, M.SLAM, M.SPIKES, M.FROST, M.SHATTER, M.SUMMON, M.STUN],
    owner: [M.SWIPE, M.THROW, M.CURSE, M.BLINK, M.SUMMON, M.STUN],
  };
  const MINI_MOVES: Partial<Record<MobKind, number[]>> = {
    headless: [M.CHARGE, M.SLAM, M.STUN], spider: [M.LEAP, M.SUMMON, M.STUN], ghoul: [M.LEAP, M.SLAM, M.SUMMON, M.STUN], golem: [M.SHOCK, M.THROW, M.STUN],
  };
  const stats = (k: MobKind, mini = false) => {
    const d = MOBS[k], hp = mini ? Math.min(MINI.cap, d.hp * MINI.hp) : d.hp;
    return ` ${hp} health, hits for ${Math.round(d.dmg * (mini ? MINI.dmg : 1))}${d.ranged ? `, and ${d.ranged.dmg} from range` : ""}.`;
  };
  // framed by height, but the wyrm and the engine are long rather than tall
  const size = (k: MobKind, mini = false) => Math.max(0.6, MOBS[k].h * (mini ? MINI.r : 1) * (k === "wyrm" ? 2.2 : k === "engine" ? 1.3 : 1));
  const out: Entry[] = [];
  for (const k of KINDS) if (!BOSSES.includes(k)) out.push({ group: "Monsters", kind: "mob", mines: true, mob: k, name: MOBS[k].name, blurb: (BLURB[k] ?? "") + stats(k), size: size(k) });
  for (const k of Object.keys(MINI_NAMES) as MobKind[]) out.push({ group: "Mini-bosses", kind: "mob", mines: true, mob: k, mini: true, name: MINI_NAMES[k]!,
    blurb: `A great ${MOBS[k].name.toLowerCase()}, guarding a level of its own.` + stats(k, true), size: size(k, true), moves: MINI_MOVES[k] });
  for (const k of BOSSES) {
    const w = WEAKNESS[k];
    out.push({ group: "Bosses", kind: "mob", mines: true, mob: k, name: MOBS[k].name, blurb: `${BLURB[k] ?? ""}${stats(k)}${w && WEAK_HINT[w] ? ` ${WEAK_HINT[w]}.` : ""}`, size: size(k), moves: MOVES[k] });
  }
  return out;
}
const MOVE_NAMES: Record<number, string> = {
  [MOVE.SWIPE]: "Swipe", [MOVE.SLAM]: "Slam", [MOVE.SHOCK]: "Shockwave", [MOVE.CHARGE]: "Charge", [MOVE.SUMMON]: "Calling for help", [MOVE.STEAM]: "Steam",
  [MOVE.FLOOD]: "Flood", [MOVE.DIVE]: "Dive", [MOVE.UNDER]: "Under the lava", [MOVE.SURFACE]: "Surfacing", [MOVE.BREATH]: "Fire breath", [MOVE.TAIL]: "Tail sweep",
  [MOVE.SPIKES]: "Ice spikes", [MOVE.FROST]: "Brings the roof down", [MOVE.SHATTER]: "Shatter", [MOVE.BLINK]: "Blink", [MOVE.THROW]: "Throw",
  [MOVE.CURSE]: "Curse", [MOVE.LEAP]: "Leap", [MOVE.STUN]: "Staggered by its weakness",
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>("view"), list = $("list"), bar = $("bar");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#2a3038");
const sky = new THREE.HemisphereLight("#fff8ec", "#58606a", 2.2);
scene.add(sky);
// the mines: a lamp, held up by whoever is looking
const lamp = new THREE.PointLight("#ffd6a6", 0, 30, 1.2);
scene.add(lamp);
const sun = new THREE.DirectionalLight("#ffffff", 1.8);
sun.position.set(2.5, 5, -3);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 3, bottom: -1 });
scene.add(sun);
const ground = new THREE.Mesh(new THREE.CircleGeometry(2.2, 48).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: "#59606a" }));
ground.receiveShadow = true;
scene.add(ground);
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 400);
const turntable = new THREE.Group();
scene.add(turntable);

// what's on the turntable now
let current = 0;
let kit = 0, coat = 0, loud = 0, catBuild: "" | "kitten" | "fat" | "long" = "";
let state = "Standing";
let colour = COLOURS[0], seed = 1;
const worn: Partial<Record<Slot, string>> = {};
let rosettes = "";
let walkZ = 0;
let avatar: Avatar | null = null, gang: Figure | null = null, cat: CatFigure | null = null;
let gull: ReturnType<typeof gullFigure> | null = null, bendy: BendyFigure | null = null, owner: Owner | null = null, flap = 0;
let punch = 0, deadT = 0;
let mob: MobView | null = null, champ = false, move = 0, moveClock = 0;
let tab: Tab = "streets";
/** A vehicle's paint or look, and the make of an everyday car. */
let vlook = 0, vmake = 0;
/** How big the thing on the turntable is and how high its middle is, to frame it. */
let fitSize = 1.8, fitMid = 1;

/** Let go of a model's own geometry and materials; the vehicles', trains' and cars' are shared and stay. */
function dispose(o: THREE.Object3D, geometry: boolean) {
  o.traverse((m) => {
    const mesh = m as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (geometry) mesh.geometry.dispose();
    for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) if (!(mat as THREE.Material & { map?: unknown }).map) mat.dispose();
  });
}
let shown: { o: THREE.Object3D; geometry: boolean } | null = null;

/** Size the floor and the sun's shadow to what's on the turntable. */
function fitStage(size: number) {
  const k = Math.max(1, size / 1.8);
  ground.scale.setScalar(k);
  sun.position.set(2.5 * k, 5 * k, -3 * k);
  Object.assign(sun.shadow.camera, { left: -2 * k, right: 2 * k, top: 3 * k, bottom: -1 * k, far: 40 * k });
  sun.shadow.camera.updateProjectionMatrix();
}

function build() {
  turntable.clear();
  if (shown) { dispose(shown.o, shown.geometry); shown = null; }
  // Bendy puts himself, his beam and its pool of light straight into the scene
  if (bendy) scene.remove(...scene.children.filter((o) => o !== ground && o !== turntable && !(o as THREE.Light).isLight));
  if (mob) { mob.dispose(); mob = null; }
  turntable.position.y = 0;
  avatar = null; gang = null; cat = null; gull = null; bendy = null; owner = null;
  const e = ENTRIES[current];
  fitSize = e.size ?? 1.8; fitMid = fitSize * 0.55;
  fitStage(1.8);
  if (e.kind === "player") {
    avatar = new Avatar("", colour, `who${seed}`);
    avatar.preview();
    avatar.tagged = false;
    walkZ = 0;
    avatar.setWear(SLOTS.map((s) => worn[s]).filter(Boolean).join(","));
    avatar.setRosettes(rosettes);
    turntable.add(avatar.root);
  } else if (e.kind === "gang") {
    gang = new Figure();
    let lk = e.look! + (e.kits ? kit : 0);
    if (e.loud) lk = withLoud(lk, loud || e.loud);
    gang.dress(lk);
    gang.root.visible = true;
    turntable.add(gang.root);
  } else if (e.kind === "gull") {
    gull = gullFigure(e.head!, e.scale!);
    turntable.add(gull.g);
  } else if (e.kind === "tourist") {
    turntable.add(touristOnBench(seed, e.name === "Hen party"));
  } else if (e.kind === "bendy") {
    bendy = new BendyFigure(scene);
    bendy.root.visible = true;
  } else if (e.kind === "owner") {
    owner = new Owner();
    turntable.add(owner.root);
  } else if (e.kind === "still") {
    const o = e.build!();
    o.traverse((m) => { m.castShadow = true; });
    turntable.add(o);
  } else if (e.kind === "vehicle") {
    const o = e.make!(e.paints?.[vlook] ?? "#ffffff", vlook, e.makes?.[vmake] ?? 0);
    o.traverse((m) => { m.castShadow = true; });
    turntable.add(o);
    shown = { o, geometry: !!e.fresh };
  } else if (e.kind === "mob") {
    mob = new MobView(e.mob!, { champion: champ, mini: e.mini });
    turntable.add(mob.group);
    moveClock = 0;
    // stand it at rest, so build() can sit it on the ground (in the mines a flier is drawn round
    // the height it hovers at, and some things stand a little into the floor)
    mob.update(0.016, 0, 0, 0, 0, 0);
  } else {
    cat = new CatFigure();
    cat.dress(kit * 16 + coat, seed, catBuild);
    cat.root.visible = true;
    turntable.add(cat.root);
  }
  punch = 0; deadT = 0;
  // stand whatever's on the turntable on the ground (a gull flies, and a tourist brings a bench;
  // a player stands themselves up when they're first posed, their legs hanging below till then)
  if (gull || e.kind === "tourist" || avatar) return;
  turntable.updateMatrixWorld(true);
  const box = new THREE.Box3();
  turntable.traverseVisible((o) => { if ((o as THREE.Mesh).isMesh) box.expandByObject(o); });
  const low = box.isEmpty() ? 0 : box.min.y;
  if (low < 0) turntable.position.y = -low + (mob && MOBS[mob.kind].fly ? 0.3 : 0);
  if (e.kind === "vehicle" && !box.isEmpty()) {
    // a vehicle is framed by its longest side, and looked at from its middle
    const dim = box.getSize(new THREE.Vector3());
    turntable.position.y = -box.min.y;
    fitSize = Math.max(dim.x, dim.z, dim.y) * 0.8;
    fitMid = dim.y / 2;
    fitStage(fitSize);
  }
}

const STATES: Record<Kind, string[]> = {
  player: ["Standing", "Walking", "Running", "Crouching", "Tummy time", "No gun"],
  gang: ["Standing", "Walking", "Running", "Punching", "Hands up", "Cuffed", "Had enough"],
  cat: ["Sitting", "Walking", "Running", "Angry", "Clawing", "Down"],
  gull: ["Flying", "Gliding", "Perched"],
  tourist: ["Sat down"],
  bendy: ["Walking", "Standing", "Searching", "Hunting", "Lashing out", "Down"],
  owner: ["Pacing", "On the phone", "Despairing", "Pointing", "Head in hands"],
  still: ["Standing"],
  mob: ["Idle", "Moving", "Winding up", "Attacking", "Dead"],
  vehicle: ["Standing"],
};
const MOODS: Record<string, Mood> = { "Pacing": "pace", "On the phone": "phone", "Despairing": "despair", "Pointing": "point", "Head in hands": "head" };

function button(text: string, on: boolean, click: (ev: MouseEvent) => void, cls = "") {
  const b = document.createElement("button");
  b.type = "button"; b.textContent = text; b.className = (on ? "on " : "") + cls;
  b.addEventListener("click", click);
  return b;
}
function group(label: string, ...els: HTMLElement[]) {
  const g = document.createElement("div");
  g.className = "group";
  if (label) { const s = document.createElement("span"); s.textContent = label; g.append(s); }
  g.append(...els);
  return g;
}
function select(options: [string, string][], value: string, change: (v: string) => void) {
  const s = document.createElement("select");
  for (const [v, t] of options) { const o = document.createElement("option"); o.value = v; o.textContent = t; s.append(o); }
  s.value = value;
  s.addEventListener("change", () => change(s.value));
  return s;
}

function drawBar() {
  const e = ENTRIES[current];
  bar.innerHTML = "";
  urlDue = 1;
  const again = () => { build(); drawBar(); };
  bar.append(button("‹", false, () => step(-1), "step"), button("›", false, () => step(1), "step"),
    button(spin ? "Turning" : "Turn", spin, () => { spin = !spin; drawBar(); }),
    button("Copy link", false, (ev) => {
      writeUrl();
      const t = ev.currentTarget as HTMLButtonElement;
      navigator.clipboard?.writeText(location.href).then(() => { t.textContent = "Copied"; }, () => { t.textContent = "Copy from the address bar"; });
    }));
  if (STATES[e.kind].length > 1) bar.append(group("", ...STATES[e.kind].map((s) => button(s, s === state, () => { state = s; build(); drawBar(); }))));
  if (e.kind === "player") {
    bar.append(group("Colour", ...COLOURS.map((c) => {
      const b = button("", c === colour, () => { colour = c; again(); }, "swatch");
      b.style.background = c; b.title = c;
      return b;
    })));
    for (const slot of SLOTS) {
      const opts: [string, string][] = [["", "Nothing"], ...WEARABLES.filter((w) => w.slot === slot).map((w): [string, string] => [w.id, w.name])];
      bar.append(group(slot === "head" ? "Head" : slot === "face" ? "Face" : "Back", select(opts, worn[slot] ?? "", (v) => { if (v) worn[slot] = v; else delete worn[slot]; again(); })));
    }
    bar.append(group("Rosettes", select([["", "None"], ["g", "Gold"], ["gs", "Gold, silver"], ["gsb", "Gold, silver, bronze"]], rosettes, (v) => { rosettes = v; again(); })));
    bar.append(button("Another face", false, () => { seed++; again(); }));
  } else if (e.kind === "cat") {
    bar.append(group("Breed", select(e.kits!.map((n, k): [string, string] => [String(k), n]), String(kit), (v) => { kit = +v; coat = 0; again(); })));
    bar.append(group("Coat", ...Array.from({ length: coatsOf(kit) }, (_, k) => button(String(k + 1), k === coat, () => { coat = k; again(); }))));
    bar.append(group("Build", ...([["", "Any"], ["kitten", "Kitten"], ["fat", "Fat"], ["long", "Long-haired"]] as const).map(([v, n]) =>
      button(n, v === catBuild, () => { catBuild = v; again(); }))));
    bar.append(button("Another cat", false, () => { seed++; again(); }));
  } else if (e.kind === "vehicle") {
    const n = e.paints?.length ?? e.looks ?? 0;
    if (n > 1) bar.append(group(e.looks ? "Look" : "Colour", ...Array.from({ length: n }, (_, k) => {
      const b = button(e.looks ? String(k + 1) : "", k === vlook, () => { vlook = k; again(); }, e.looks ? "" : "swatch");
      if (e.paints) { b.style.background = e.paints[k]; b.title = e.paints[k]; }
      return b;
    })));
    if (e.makes) bar.append(group("Make", select(e.makes.map((m, k): [string, string] => [String(k), MAKES[m]]), String(vmake), (v) => { vmake = +v; again(); })));
  } else if (e.kind === "tourist") {
    bar.append(button("Another tourist", false, () => { seed++; again(); }));
  } else if (e.kind === "mob") {
    bar.append(button("Champion", champ, () => { champ = !champ; again(); }), button("Hit it", false, () => mob?.flash()));
    if (e.moves) bar.append(group("Move", select([["0", "None"], ...e.moves.map((m): [string, string] => [String(m), MOVE_NAMES[m] ?? String(m)])], String(move), (v) => { move = +v; moveClock = 0; drawBar(); })));
  } else if (e.kind === "gang") {
    if (e.kits) bar.append(group("Kit", select(e.kits.map((n, k): [string, string] => [String(k), n]), String(kit), (v) => { kit = +v; again(); })));
    if (e.loud) bar.append(group("Wearing", select(LOUD.slice(1).map((n, k): [string, string] => [String(k + 1), n]), String(loud || e.loud), (v) => { loud = +v; again(); })));
    bar.append(button("Another one", false, again));
  }
}

/** The next or last one on the same tab, round and round. */
function step(by: number) {
  const same = ENTRIES.map((e, k) => [e, k] as const).filter(([e]) => tabOf(e) === tab).map(([, k]) => k);
  const at = same.indexOf(current);
  show(same[(at + by + same.length) % same.length]);
}

function show(i: number) {
  current = (i + ENTRIES.length) % ENTRIES.length;
  kit = 0; coat = 0; loud = 0; move = 0; vlook = 0; vmake = 0;
  state = STATES[ENTRIES[current].kind][0];
  const e = ENTRIES[current];
  setTab(tabOf(e));
  $("name").textContent = e.name;
  $("blurb").textContent = e.blurb;
  list.querySelectorAll<HTMLButtonElement>("button[data-i]").forEach((b) => b.classList.toggle("on", +b.dataset.i! === current));
  build();
  drawBar();
  writeUrl();
}

// ---- the address: everything you've picked, and where you're looking from, so a link shows exactly this ----
const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
/** Its name in the address; the mines' have "mines-" in front (they have a Gaffer too). */
const idOf = (e: Entry) => (e.mines ? "mines-" : "") + slug(e.name);
let urlDue = 0;
function writeUrl() {
  const e = ENTRIES[current], q = new URLSearchParams();
  q.set("who", idOf(e));
  if (state !== STATES[e.kind][0]) q.set("pose", slug(state));
  if (e.kind === "player") {
    if (colour !== COLOURS[0]) q.set("colour", colour.slice(1));
    for (const s of SLOTS) if (worn[s]) q.set(s, worn[s]!);
    if (rosettes) q.set("rosettes", rosettes);
  }
  if (e.kind === "gang" && e.kits && kit) q.set("kit", String(kit));
  if (e.kind === "gang" && e.loud && loud) q.set("loud", String(loud));
  if (e.kind === "cat") { q.set("breed", String(kit)); if (coat) q.set("coat", String(coat)); if (catBuild) q.set("build", catBuild); }
  if (e.kind === "vehicle") { if (vlook) q.set("look", String(vlook)); if (vmake) q.set("make", String(vmake)); }
  if (e.kind === "mob") { if (champ) q.set("champion", "1"); if (move) q.set("move", String(move)); }
  if (seed !== 1) q.set("seed", String(seed));
  q.set("view", [yaw % (Math.PI * 2), pitch, dist].map((v) => v.toFixed(2)).join(","));
  if (!spin) q.set("turn", "0");
  try { history.replaceState(null, "", `?${q.toString().replace(/%2C/g, ",")}`); } catch { /* fine without */ }
}
function readUrl() {
  const q = new URLSearchParams(location.search);
  const who = q.get("who"), n = parseInt(location.hash.slice(1));
  const i = who ? ENTRIES.findIndex((e) => idOf(e) === who) : Number.isFinite(n) ? n : 0;
  show(Math.max(0, Math.min(ENTRIES.length - 1, i)));
  const e = ENTRIES[current], num = (k: string, lo: number, hi: number) => {
    const v = parseInt(q.get(k) ?? ""); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : null;
  };
  const pose = q.get("pose");
  state = STATES[e.kind].find((s) => slug(s) === pose) ?? state;
  const c = "#" + (q.get("colour") ?? "");
  if (COLOURS.includes(c)) colour = c;
  for (const s of SLOTS) { const w = q.get(s); if (w && WEARABLES.some((x) => x.id === w && x.slot === s)) worn[s] = w; }
  rosettes = (q.get("rosettes") ?? "").replace(/[^gsb]/g, "").slice(0, 3);
  if (e.kind === "cat") { kit = num("breed", 0, e.kits!.length - 1) ?? 0; coat = Math.min(num("coat", 0, 15) ?? 0, coatsOf(kit) - 1); }
  else if (e.kits) kit = num("kit", 0, e.kits.length - 1) ?? 0;
  loud = num("loud", 1, LOUD.length - 1) ?? 0;
  const b = q.get("build");
  catBuild = b === "kitten" || b === "fat" || b === "long" ? b : "";
  if (e.kind === "vehicle") {
    vlook = num("look", 0, Math.max(0, (e.paints?.length ?? e.looks ?? 1) - 1)) ?? 0;
    vmake = num("make", 0, Math.max(0, (e.makes?.length ?? 1) - 1)) ?? 0;
  }
  seed = num("seed", 1, 1e6) ?? 1;
  champ = q.get("champion") === "1";
  const mv = num("move", 0, 99) ?? 0;
  move = e.moves?.includes(mv) ? mv : 0;
  const v = (q.get("view") ?? "").split(",").map(Number);
  if (v.length === 3 && v.every(Number.isFinite)) { yaw = v[0]; pitch = Math.max(-0.2, Math.min(1.2, v[1])); dist = Math.max(1.6, Math.min(9, v[2])); }
  spin = q.get("turn") !== "0";
  build();
  drawBar();
  writeUrl();
}

// the list down the side, by group, under three tabs: the streets, the mines and the vehicles
const tabs = document.createElement("div");
tabs.className = "tabs";
const TABS = Object.keys(TAB_NAMES) as Tab[];
const tabButtons = TABS.map((t) =>
  button(TAB_NAMES[t], false, () => { if (tab !== t) show(ENTRIES.findIndex((e) => tabOf(e) === t)); }));
tabs.append(...tabButtons);
list.append(tabs);
// on a phone the list is a drop-down between the arrows instead (the page's CSS)
const picker = document.createElement("div"), pick = document.createElement("select");
picker.className = "picker";
pick.setAttribute("aria-label", "Which one");
pick.addEventListener("change", () => show(+pick.value));
picker.append(button("‹", false, () => step(-1)), pick, button("›", false, () => step(1)));
list.append(picker);
/** The drop-down's choices: this tab's, by group. */
function fillPicker() {
  pick.innerHTML = "";
  let og: HTMLOptGroupElement | null = null;
  ENTRIES.forEach((e, k) => {
    if (tabOf(e) !== tab) return;
    if (!og || og.label !== e.group) { og = document.createElement("optgroup"); og.label = e.group; pick.append(og); }
    const o = document.createElement("option");
    o.value = String(k); o.textContent = e.name;
    og.append(o);
  });
  pick.value = String(current);
}
const groups: Record<Tab, HTMLElement[]> = { streets: [], mines: [], vehicles: [] };
let lastGroup = "";
ENTRIES.forEach((e, k) => {
  const into = groups[tabOf(e)];
  if (e.group !== lastGroup) {
    const h = document.createElement("h2"); h.textContent = lastGroup = e.group; into.push(h);
  }
  const b = button(e.name, false, () => show(k));
  b.dataset.i = String(k);
  into.push(b);
});
list.append(...groups.streets, ...groups.mines, ...groups.vehicles);
/** Show one tab's list, and light the stage for it: daylight for Bath, a lamp in the dark for the mines. */
function setTab(t: Tab) {
  tab = t;
  tabButtons.forEach((b, k) => b.classList.toggle("on", TABS[k] === t));
  for (const k of TABS) for (const el of groups[k]) el.hidden = t !== k;
  fillPicker();
  const dark = t === "mines";
  scene.background = new THREE.Color(dark ? "#0b0806" : "#2a3038");
  sky.intensity = dark ? 0.7 : 2.2;
  sun.intensity = dark ? 0.5 : 1.8;
  lamp.intensity = dark ? 30 : 0;
  (ground.material as THREE.MeshLambertMaterial).color.set(dark ? "#3a3229" : "#59606a");
}

// turning and zooming
let yaw = Math.PI, pitch = 0.12, dist = 4.6, spin = true, camMoved = false, drag: { x: number; y: number } | null = null;
canvas.addEventListener("pointerdown", (ev) => { drag = { x: ev.clientX, y: ev.clientY }; if (spin) { spin = false; drawBar(); } canvas.setPointerCapture(ev.pointerId); canvas.style.cursor = "grabbing"; });
canvas.addEventListener("pointermove", (ev) => {
  if (!drag) return;
  yaw -= (ev.clientX - drag.x) * 0.01;
  pitch = Math.max(-0.2, Math.min(1.2, pitch + (ev.clientY - drag.y) * 0.006));
  drag = { x: ev.clientX, y: ev.clientY };
  camMoved = true;
});
canvas.addEventListener("pointerup", () => { drag = null; canvas.style.cursor = "grab"; });
canvas.addEventListener("wheel", (ev) => { ev.preventDefault(); dist = Math.max(1.6, Math.min(9, dist * (1 + ev.deltaY * 0.001))); camMoved = true; }, { passive: false });
addEventListener("keydown", (ev) => {
  if ((ev.target as HTMLElement).tagName === "SELECT") return;
  if (ev.key === "ArrowDown" || ev.key === "ArrowRight") { step(1); ev.preventDefault(); }
  if (ev.key === "ArrowUp" || ev.key === "ArrowLeft") { step(-1); ev.preventDefault(); }
});

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }
}

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  resize();
  if (spin) yaw += dt * 0.5;
  // keep the address up to date, but not every frame
  if (urlDue || camMoved) { urlDue += dt; if (urlDue > 0.3) { urlDue = 0; camMoved = false; writeUrl(); } }
  const size = fitSize;
  // a little further back on a tall, narrow screen, so it fits across it
  const lookY = fitMid, d = dist * Math.max(0.35, size / 1.8) * Math.max(1, (ENTRIES[current].kind === "vehicle" ? 1.15 : 0.75) / camera.aspect);
  camera.position.set(Math.sin(yaw) * Math.cos(pitch) * d, lookY + Math.sin(pitch) * d, Math.cos(yaw) * Math.cos(pitch) * d);
  camera.lookAt(0, lookY, 0);
  if (avatar) {
    // the avatar draws itself from where it's been, like any other player: walk it along on the spot
    walkZ -= dt * (state === "Walking" ? 1.6 : state === "Running" ? 6 : 0);
    avatar.armed = state !== "No gun";
    avatar.push({ t: now, x: 0, y: 0, z: walkZ, yaw: 0, pitch: 0, crouch: state === "Crouching" ? 1 : 0, prone: state === "Tummy time" ? 1 : 0 });
    avatar.update(now, dt);
    avatar.root.position.set(0, 0, 0);
  }
  if (gang) {
    // had enough: over he goes, back up, and legs it on the spot, over and over
    deadT = state === "Had enough" ? (deadT + dt) % (OFF_SECS + 2) : 0;
    const speed = state === "Walking" ? 1.3 : state === "Running" ? 5.7 : deadT > OFF_SECS ? FLEE : 0;
    if (state === "Punching") { punch -= dt * 1.4; if (punch <= -0.4) punch = 1; } else punch = 0;
    gang.hands = state === "Hands up" ? 1 : state === "Cuffed" ? 2 : 0;
    gang.pose(0, 0, 0, 0, speed, Math.max(0, punch), deadT, dt);
  }
  if (cat) {
    const speed = state === "Walking" ? 1.2 : state === "Running" ? 6 : 0;
    if (state === "Clawing") { punch -= dt * 2; if (punch <= -0.4) punch = 1; } else punch = 0;
    deadT = state === "Down" ? deadT + dt : 0;
    cat.pose(0, 0, 0, 0, speed, false, Math.max(0, punch), state === "Angry" || state === "Clawing", deadT, dt);
  }
  if (gull) {
    const s = ENTRIES[current].scale!, perched = state === "Perched";
    flap += dt * (state === "Flying" ? 7 : 0);
    const wa = perched ? 1.2 : state === "Gliding" ? 0.08 : Math.sin(flap) * 0.6;
    gull.wl.rotation.z = wa; gull.wr.rotation.z = -wa;
    gull.wl.scale.x = gull.wr.scale.x = perched ? 0.35 : 1;
    gull.g.position.y = perched ? 0.13 * s : size * 0.55;
  }
  if (bendy) {
    const t = now / 1000;
    const speed = state === "Walking" ? 1.2 : 0, lash = state === "Lashing out" ? (t * 1.2) % 1 : 0;
    deadT = state === "Down" ? deadT + dt : 0;
    const beam = state === "Searching" || state === "Hunting";
    bendy.pose(0, 0, 0, 0, Math.sin(t * 0.6) * 0.6, speed, lash, 1, deadT, state === "Hunting", dt);
    bendy.aim(0, 0, -8, state === "Hunting", beam && !deadT);
  }
  if (mob) {
    lamp.position.copy(camera.position).add(new THREE.Vector3(0.6, 0.8, 0));
    const t = now / 1000;
    let st = state === "Moving" ? 1 : state === "Winding up" ? 2 : state === "Dead" ? 3 : 0, mv = 0;
    // attacking: wind up, strike, and again; a boss's move goes round the same way
    moveClock += dt;
    if (state === "Attacking" || move) {
      const c = moveClock % 3;
      st = c < 1.1 ? 2 : 1;
      mv = move && c < 2.6 ? move : 0;
    }
    const speed = MOBS[mob.kind].speed;
    mob?.update(dt, st, st === 1 ? (state === "Moving" ? speed : speed * 0.3) : 0, t, mv, move === MOVE.SUMMON ? 1 : 0);
    // dead: it falls and fades; then it's back for another look
    if (st === 3 && moveClock > 4.5) build();
  }
  if (owner) owner.pose(0, 0, 0, 0, state === "Pacing" ? 1.1 : 0, MOODS[state] ?? "pace", now / 1000, dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

readUrl();
requestAnimationFrame(frame);
