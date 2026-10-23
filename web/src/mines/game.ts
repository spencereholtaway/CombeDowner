// Under Combe Down: a co-op dungeon crawl through the old stone mines, run by run.
//
// How a game is shared (the same pattern as the main game, see ../game.ts):
// - Everyone builds each level from the host's seed (gen.ts), so the host only sends a few numbers:
//   the seed, the depth, which levers are pulled, which chests are open, what's lying about ("mw").
// - The host is the player with the lowest id among those who already have the mine, so someone just
//   arriving never starts a new run over the party's (if two runs meet, the older party's carries on).
//   It runs the monsters (mobs.ts) and sends where they are ("mob"). If it leaves, the next player
//   carries on from the last list it heard.
// - You decide your own hits on monsters and tell the host ("mhit"); the host decides theirs on you
//   ("mhurt"). Using things (levers, chests, the winze, picking up a friend) goes through the host
//   ("muse"), which says what happened to everyone ("mev").
// - Positions ("st") and names ("hello") go to everyone, as do voices (../voice.ts).
import * as Telemetry from "../telemetry";
import * as THREE from "three";
import * as SFX from "../audio";
import { Avatar, colourFor } from "../avatar";
import type { Net } from "../net";
import { Player } from "../player";
import { Voice } from "../voice";
import { show } from "../show";
import { CELL, DEPTHS, generate, Level, RUN_BOSS, RUN_INFO, RunTheme, runTheme, seedText, WEAKNESS } from "./gen";
import { CLASS_WEAPON, CLASSES, ClassId, heldName, loadout, RELICS, stats, Stats, WEAPONS } from "./items";
import { iconCanvas, iconURL } from "./icons";
import { glow } from "./art";
import { MineLevel } from "./level";
import { CHAMP, Horde, KINDS, MOBS, MobSim, newSim, PACK, Prey, radius, unpack } from "./mobs";
import { HostCtx, PuzzleSet, Target } from "./puzzles";
import { MobView } from "./mobviews";
import { heldModel, Viewmodel } from "./viewmodel";
import { bossBrain, bossName, guards, isBoss, MOVE, stagger, WEAK_DMG, WEAK_HINT, WEAK_LINE, weaknessOf } from "./bosses";
import { BossFx } from "./bossfx";
import { pop } from "../pop";

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

const ST_EVERY = 0.05, MOB_EVERY = 0.1, MW_EVERY = 1;
const REVIVE_TIME = 3;      // seconds holding E to pick up a friend (a flask of tea makes it quicker)
const WIPE_WAIT = 7;        // seconds after the whole party is down before a fresh run starts
const LAMP_LIGHTS = 7, FRIEND_LIGHTS = 3;
const MANA = 100, MANA_REGEN = 9;
const BOLT_COST = 16, HEAL_COST = 45, HEAL_AMOUNT = 30, HEAL_RANGE = 6;
const DRAW_TIME = 0.9;      // seconds to draw a bow all the way
const LAVA_BURN = 45;       // health a second standing in lava
const ICE_GRIP = 0.12;

/** What you can have in your hands, by number, for the state message. Unknown ones are sent as the pick. */
const HELD_KINDS = ["pick", "sledge", "saw", "bow", "fire", ...Object.keys(WEAPONS).filter((k) => !["pick", "sledge", "saw"].includes(k))];

/** A found item on its way out of a chest and into someone's pack. */
interface Flyer { o: THREE.Group; icon: THREE.Sprite; glow: THREE.Sprite; t: number; from: THREE.Vector3; hover: THREE.Vector3; who: string; item: string }

/** An arrow or a fire bolt in flight. Yours can hit; other people's are just for show. */
interface Shot { kind: "arrow" | "bolt"; o: THREE.Object3D; v: THREE.Vector3; dmg: number; mine: boolean; life: number }

/** What the host says about the run. */
interface World {
  run: number; seed: number; depth: number;
  ps: number[][];          // each puzzle's state (puzzles.ts)
  ch: number[]; gate: number;
  pk: number[][];          // pints lying about: id, x, z
  ph: number;              // 0 playing, 1 the party wiped, 2 out in the daylight
  t0: number; k: number;   // when the run started (ms since 1970) and monsters killed
  end: number;             // when it finished
  /** When this party first went down, kept from run to run: if two parties meet, the older one carries on. */
  born?: number;
  /** Who last sent this world, so a newcomer who ties on `born` doesn't take over the host's mine. */
  host?: string;
}

interface Remote {
  id: string; name: string; colour: string; avatar: Avatar; last: number;
  x: number; y: number; z: number; hp: number; max: number; down: boolean; depth: number; run: number;
  /** What they're holding, and its model in their right hand. */
  held: string; hand: THREE.Group;
  /** We've had their state, so we know whether they're in a mine yet (run). */
  heard?: boolean;
  /** When their party first went down (World.born). */
  born?: number;
}

interface Mob {
  id: number; kind: MobSim["kind"]; champ: boolean; mini: boolean; view: MobView; x: number; y: number; z: number; yaw: number;
  tx: number; tz: number; tyaw: number; hp: number; max: number; state: number; speed: number; move: number; phase: number;
}

export class MineGame {
  readonly scene = new THREE.Scene();
  readonly player: Player;
  readonly voice: Voice;
  readonly view = new Viewmodel();
  active = false;
  /** Where the mouse can't be captured (some embedded pages): move the mouse to look, push to an edge to keep turning. */
  freeLook = false;
  private mouseX = 0.5;
  private level: MineLevel | null = null;
  private puzzles: PuzzleSet | null = null;
  private L: Level | null = null;
  private levelKey = "";
  private W: World | null = null;
  private horde: Horde | null = null;
  private lastMobs: number[] = [];
  private nextMob = 0;
  private nextPint = 0;
  private wasHost = false;
  private remotes = new Map<string, Remote>();
  private known: Set<string>;                       // who's said hello (see peers())
  private mobs = new Map<number, Mob>();
  private pints = new Map<number, THREE.Object3D>();
  private pintGeo = new THREE.CylinderGeometry(0.09, 0.07, 0.24, 8);
  private pintMat = new THREE.MeshLambertMaterial({ color: "#c47a1c", emissive: "#3a1c00" });
  /** Bosses' telegraphs (bossfx.ts). */
  private bossFx = new BossFx({
    ground: (x, z) => this.level?.ground(x, z) ?? 0,
    mob: (id) => { const m = this.mobs.get(id); return m ? { x: m.x, z: m.z, yaw: m.yaw, y: m.y } : null; },
    who: (id) => id === this.selfId ? this.player.pos : this.remotes.get(id)?.avatar ?? null,
  });
  private weakT = new Map<number, number>();

  // you
  private hp = 100;
  private down = false;
  private relics: string[] = [];
  private cls: ClassId = "quarryman";
  /** What's in your hands: a melee weapon id, "bow" or "fire" (see loadout() in items.ts). */
  private held = "pick";
  private S: Stats = stats([]);
  private flyers: Flyer[] = [];
  private iconTex = new Map<string, THREE.Texture>();
  private cardT = 0;
  private wheelAcc = 0;
  private wheelT = 0;
  private mana = MANA;
  private drawF = 0;          // how far the bow is drawn, 0 to 1
  private shots: Shot[] = [];
  private myRun = -1;
  private lucoUntil = 0;
  private swingCd = 0;
  private swingHit = -1;      // seconds until the swing in progress lands
  private hits = 0;           // for the mason's mark's one in five
  private reviving = "";
  private pumpT = 0;
  private takeT = 0;
  private camY = 0;
  private arrivals = new Set<string>();    // who has joined the room and not yet said hello
  private spawned = new Set<number>();   // host: which of the level's spawns are out
  private zaps: { o: THREE.Mesh; life: number }[] = [];
  private reviveT = 0;
  private hurtT = 0;
  private hitT = 0;
  private stepT = 0;
  private mouseDown = false;
  private eDown = false;

  // timers
  private waitW = 0;
  private stT = 0; private mobT = 0; private mwT = 0; private lightT = 0; private seenT = 0;
  private wipeT = 0;
  private toastT = 0;
  private signT = 0;
  private clock = 0;

  // light
  private torch: THREE.PointLight;
  private lampLights: THREE.PointLight[] = [];
  private friendLights: THREE.PointLight[] = [];
  private fxLight = new THREE.PointLight("#ffb070", 0, 10, 1.2);
  private sky = new THREE.HemisphereLight("#9a9080", "#6a5a48", 2.0);

  // the map you've drawn by walking about
  private seen: Uint8Array = new Uint8Array(0);
  private mapCtx: CanvasRenderingContext2D;
  private bigCtx: CanvasRenderingContext2D;

  constructor(private camera: THREE.PerspectiveCamera, private net: Net, private name: string, readonly code: string,
    private opts: { depth?: number; seed?: number; known?: string[] } = {}) {
    this.known = new Set(opts.known);
    this.scene.background = new THREE.Color("#030202");
    this.scene.fog = new THREE.Fog("#050302", 6, 44);
    this.scene.add(this.sky);
    this.torch = new THREE.PointLight("#ffd6a6", 4.5, 16, 1);
    this.scene.add(this.torch);
    for (let k = 0; k < LAMP_LIGHTS; k++) { const l = new THREE.PointLight("#ffa850", 0, 9, 1); this.lampLights.push(l); this.scene.add(l); }
    this.scene.add(this.fxLight);
    this.scene.add(this.bossFx.group);
    for (let k = 0; k < FRIEND_LIGHTS; k++) { const l = new THREE.PointLight("#ffd6a6", 0, 11, 1); this.friendLights.push(l); this.scene.add(l); }

    const self = this;
    const ground = {
      ground: (x: number, z: number) => this.level?.ground(x, z) ?? 0,
      collide: (p: { x: number; z: number }, y: number, r: number) => this.level?.collide(p, y, r),
      get lastBlock() { return self.level?.lastBlock ?? -1; },
    };
    this.player = new Player(ground);
    this.voice = new Voice(net, (text, secs) => this.toast(text, secs));
    this.mapCtx = ($("automap") as HTMLCanvasElement).getContext("2d")!;
    this.bigCtx = ($("bigmapcanvas") as HTMLCanvasElement).getContext("2d")!;

    // ---- the network --------------------------------------------------------------------------
    const here = (fn: (d: any, from: string) => void) => (d: any, from: string) => { try { fn(d, from); } catch (e) { console.warn(e); } };
    net.on("hello", here((d, from) => {
      this.onHello(d, from);
      if (d?.ask) net.send("hello", { name: this.name, mines: 1, cls: this.cls }, from);
    }));
    net.on("st", here((d, from) => this.onState(d, from)));
    net.on("mw", here((d: World, from) => { if (from === this.hostId || !this.W) this.applyWorld(d); }));
    net.on("mob", here((d: number[], from) => { if (from === this.hostId && !this.isHost) { this.lastMobs = d; this.syncMobs(unpack(d)); } }));
    net.on("mhit", here((d: number[], from) => { if (this.isHost) this.applyHit(d[0], d[1], from, d[2] === 1); }));
    net.on("muse", here((d, from) => { if (this.isHost) this.applyUse(d, from); }));
    net.on("mev", here((d, from) => { if (from === this.hostId) this.onEvent(d); }));
    net.on("mhurt", here((d: number[], from) => { if (from === this.hostId) this.takeHit(d[0], d[1]); }));
    net.on("mfx", here((d: number[]) => { if (Array.isArray(d) && this.W && d[7] === this.W.depth) this.fire(d[0] ? "bolt" : "arrow", d[1], d[2], d[3], d[4], d[5], d[6], 0, false); }));
    net.onJoin = (id) => {
      net.send("hello", { name: this.name, mines: 1, cls: this.cls }, id);
      // Someone on the street only looking for this game joins the room too, and never says hello: wait for theirs
      // before sharing a mic and the level with them, so they cost the party nothing (see onHello).
      this.arrivals.add(id);
    };
    net.onLeave = (id) => {
      this.arrivals.delete(id);
      this.known.delete(id);
      const r = this.remotes.get(id);
      if (r) { this.scene.remove(r.avatar.root); this.remotes.delete(id); this.feed(`<b>${esc(r.name)}</b> went home`); }
      this.voice.drop(id);
    };
    net.onError = (msg) => this.toast(msg, 6);

    // ---- input --------------------------------------------------------------------------------
    addEventListener("mousedown", (e) => {
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2 && this.active) this.healLight();
    });
    addEventListener("mouseup", (e) => { if (e.button === 0) this.mouseDown = false; });
    addEventListener("contextmenu", (e) => e.preventDefault());
    addEventListener("mousemove", (e) => {
      this.mouseX = e.clientX / innerWidth;
      if (this.active && (document.pointerLockElement || this.freeLook)) this.player.look(e.movementX, e.movementY, 1);
    });
    addEventListener("keydown", (e) => {
      if (e.code === "KeyE" && !e.repeat) { this.eDown = true; if (this.active) this.use(); }
      if (e.code === "KeyM" && !e.repeat && this.active) $("bigmap").hidden = !$("bigmap").hidden;
      if (e.code === "KeyV" && !e.repeat && this.active) this.voice.radio(true);
      // 1 to 4: what's in your hands
      if (/^Digit[1-9]$/.test(e.code) && !e.repeat && this.active) this.select(Number(e.code.slice(5)) - 1);
    });
    addEventListener("wheel", (e) => {
      if (!this.active) return;
      this.wheelAcc += e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
      const now = performance.now();
      if (Math.abs(this.wheelAcc) >= 40 && now >= this.wheelT) {
        this.cycle(Math.sign(this.wheelAcc));
        this.wheelAcc = 0;
        this.wheelT = now + 120;
      }
    }, { passive: true });
    this.initTooltip();
    addEventListener("keyup", (e) => {
      if (e.code === "KeyE") this.eDown = false;
      if (e.code === "KeyV") this.voice.radio(false);
    });
    addEventListener("blur", () => { this.mouseDown = this.eDown = false; this.voice.radio(false); });
    $("bigmap").onclick = () => ($("bigmap").hidden = true);
  }

  get selfId() { return this.net.selfId; }
  /** The host is whoever has the lowest id, so everyone agrees without asking. */
  /** The party: players who've said hello. Someone on a menu who's only looking for the game doesn't count. */
  private peers() { return this.net.peers().filter((id) => this.known.has(id)); }
  /** The host runs the monsters and owns the mine, so it's someone who has one: a newcomer with a lower id waits for the world first. */
  get hostId() {
    const party = this.peers();
    // (whoever sent us the mine counts as having one even before their first position update)
    const ready = party.filter((id) => (this.remotes.get(id)?.run ?? 0) > 0 || id === this.W?.host).map((id) => ({ id, t0: this.remotes.get(id)?.born ?? 0 }));
    if (this.W) ready.push({ id: this.selfId, t0: this.W.born ?? 0 });
    if (!ready.length) return [this.selfId, ...party].sort()[0];
    // the oldest party wins, so someone who started on their own before they found us joins ours
    const sent = (id: string) => (id === this.W?.host ? 0 : 1);   // on a tie, whoever's already hosting
    return ready.sort((a, b) => a.t0 - b.t0 || sent(a.id) - sent(b.id) || (a.id < b.id ? -1 : 1))[0].id;
  }
  get isHost() { return this.hostId === this.selfId; }
  get weaponScene() { return this.view.scene; }

  /** Start a fresh run (host only). */
  newRun() {
    // seeds are up to six base-36 characters (see seedText)
    this.W = { run: Math.floor(Math.random() * 1e9), seed: this.opts.seed ?? Math.floor(Math.random() * 36 ** 6), depth: Math.max(1, Math.min(DEPTHS, this.opts.depth ?? 1)), ps: [], ch: [], gate: 0, pk: [], ph: 0, t0: Date.now(), k: 0, end: 0, born: this.W?.born ?? Date.now() };
    this.applyWorld(this.W);
    this.startHorde();
    this.sendWorld();
  }

  /** How many monsters to expect: more of them for a bigger party, and a bit tougher. */
  private get partySize() { return 1 + this.peers().length; }
  private get mobScale() { return 1 + 0.1 * (this.partySize - 1); }
  /** Bosses and mini-bosses get a lot tougher for a bigger party. */
  private scaleOf(s: { kind: MobSim["kind"]; mini?: boolean }) { return guards(s) ? 0.6 + 0.4 * this.partySize : this.mobScale; }
  private makeHorde(sims: MobSim[]) {
    const h = new Horde(this.level!, sims);
    h.brain = bossBrain;
    return h;
  }

  private startHorde() {
    if (!this.L || !this.level) return;
    const n = this.partySize;
    const out = this.L.spawns.filter((s) => s.need <= n);
    this.spawned = new Set(out.map((s) => s.id));
    this.horde = this.makeHorde(out.map((s) => newSim(s.id, s.kind, s.x, s.z, this.scaleOf(s), s.champ, !!s.mini)));
    this.nextMob = this.L.spawns.length;
  }

  /** Someone joined partway down a level: send out the monsters kept back for a bigger party. */
  private reinforce() {
    if (!this.L || !this.horde) return;
    for (const s of this.L.spawns) {
      if (s.need > this.partySize || this.spawned.has(s.id) || this.horde.sims.some((m) => m.id === s.id)) continue;
      this.spawned.add(s.id);
      this.horde.sims.push(newSim(s.id, s.kind, s.x, s.z, this.scaleOf(s), s.champ, !!s.mini));
    }
  }

  private hostCtx: HostCtx = {
    party: () => this.party(),
    spawn: (kind, x, z) => {
      const p = { x, z };
      this.level?.collide(p, this.level.ground(x, z), 0.5, false);
      this.horde?.sims.push(newSim(this.nextMob++, kind, p.x, p.z, this.mobScale));
    },
    emit: (ev) => this.emit(ev),
  };

  /** The way down opens once every puzzle's solved (and the boss is dead, on the last level). */
  private checkGate() {
    const W = this.W, L = this.L;
    if (!W || !L || W.gate === 1) return;
    if (!W.ps.every((s) => s[0] === 1)) return;
    // a boss, or a mini-boss guarding the winze, keeps it shut while it lives
    if (this.horde?.sims.some((m) => guards(m) && m.state !== 3)) return;
    W.gate = 1;
    this.emit({ k: "gate" });
  }

  private sendWorld() { if (this.W) { this.W.host = this.selfId; this.net.send("mw", this.W); this.mwT = MW_EVERY; } }

  // ---- what the host says --------------------------------------------------------------------------

  private applyWorld(W: World) {
    const fresh = !this.W || this.W.run !== W.run;
    this.W = W;
    if (W.run !== this.myRun) {
      // a new run: start again with nothing
      this.myRun = W.run;
      this.relics = [];
      this.S = stats(this.relics, this.cls);
      if (this.held !== CLASS_WEAPON[this.cls]) { this.held = CLASS_WEAPON[this.cls]; this.view.hold(this.held); }
      this.hp = this.S.maxHp;
      this.mana = MANA;
      this.renderInv();
      this.down = false;
      this.lucoUntil = 0;
      $("summary").hidden = true;
    }
    const key = `${W.run}:${W.seed}:${W.depth}`;   // a new run on the same seed is a new level too
    if (key !== this.levelKey) {
      this.buildLevel(W.seed, W.depth);
      this.levelKey = key;
      if (!fresh || W.depth > 1) this.feed(`Down to <b>${esc(this.L!.name)}</b>`);
    }
    const lv = this.level!;
    if (this.isHost && !W.ps.length && this.puzzles) W.ps = this.puzzles.init(this.partySize);
    this.puzzles?.sync(W.ps);
    lv.chests.forEach((_, k) => lv.setChest(k, W.ch[k] === 1));
    lv.setGate(W.gate === 1);
    // pints lying about
    const want = new Set(W.pk.map((p) => p[0]));
    for (const [id, o] of this.pints) if (!want.has(id)) { this.scene.remove(o); this.pints.delete(id); }
    for (const [id, x, z] of W.pk) {
      if (this.pints.has(id)) continue;
      const m = new THREE.Mesh(this.pintGeo, this.pintMat);
      m.position.set(x, lv.ground(x, z) + 0.3, z);
      this.scene.add(m);
      this.pints.set(id, m);
    }
    if (W.ph === 2 || W.ph === 1) this.showSummary();
  }

  private buildLevel(seed: number, depth: number) {
    if (this.level) { this.scene.remove(this.level.group); this.level.dispose(); }
    this.puzzles?.dispose();
    for (const m of this.mobs.values()) { this.scene.remove(m.view.group); m.view.dispose(); }
    this.mobs.clear();
    for (const o of this.pints.values()) this.scene.remove(o);
    this.pints.clear();
    for (const f of this.flyers) this.dropFlyer(f);
    this.flyers = [];
    this.L = generate(seed, depth);
    this.level = new MineLevel(this.L);
    this.scene.add(this.level.group);
    this.puzzles = new PuzzleSet(this.level, this.L);
    this.puzzles.onDraught = () => this.toast("You feel a draught from somewhere in the rock", 3);
    this.scene.add(this.puzzles.group);
    this.levelKey = `${seed}:${depth}`;
    Telemetry.note("mines_depth:" + depth);
    this.seen = new Uint8Array(this.L.w * this.L.h);
    this.horde = null;
    this.lastMobs = [];
    this.bossFx.clear();
    this.weakT.clear();
    // arrive at the foot of the ladder, spread out a little
    const k = [this.selfId, ...this.peers()].sort().indexOf(this.selfId);
    const a = k * 1.3;
    const p = { x: this.L.start.x + Math.cos(a) * 1.2 * (k ? 1 : 0), z: this.L.start.z + Math.sin(a) * 1.2 * (k ? 1 : 0) };
    this.level.collide(p, 0, 0.4);
    this.player.spawn(p.x, p.z, Math.PI * 0.75);
    const info = RUN_INFO[this.L.run];
    this.look(this.L.run);
    this.sign(depth === 1 ? `${info.name}: ${this.L.name}` : this.L.boss ? `${this.L.name}. Something is moving.` : this.L.name);
    if (depth === 1) {
      this.toast(`${info.blurb}. Solve the puzzles to open the winze (they're on your map), then everyone climb down`, 7);
      this.feed(`Mine seed <b>${seedText(seed)}</b>: ${esc(info.name)}`);
    }
    // a word about the boss's weakness, while there's still time to find it
    const weak = WEAKNESS[RUN_BOSS[this.L.run]];
    if (depth < DEPTHS && weak && WEAK_HINT[weak]) this.feed(`<i>${esc(WEAK_HINT[weak])}</i>`);
    $("pauseseed").textContent = `Mine seed ${seedText(seed)} (${info.name}). Type it in on the way down to go down this mine again.`;
    const guard = this.L.spawns.find((s) => guards(s));
    if (guard) this.toast(this.L.boss ? `Defeat ${bossName(guard)} and climb out to daylight` : `${bossName(guard)} guards the winze. ${depth === 1 ? "Solve the puzzles and defeat it to go on down" : "Defeat it to go on down"}`, 5);
    if (this.isHost) this.startHorde();
  }

  // ---- the host's side --------------------------------------------------------------------------------

  private emit(ev: any) {
    this.net.send("mev", ev);
    this.onEvent(ev);
  }

  private applyUse(d: any, from: string) {
    const W = this.W, L = this.L;
    if (!W || !L || W.ph !== 0 && d?.k !== "again") return;
    switch (d?.k) {
      case "pz": {
        if (!this.puzzles || !this.puzzles.use(W.ps, d.id | 0, String(d.a), d.v | 0, from, this.hostCtx)) return;
        this.checkGate();
        break;
      }
      case "chest": {
        const id = d.id | 0;
        if (id < 0 || id >= L.chests.length || W.ch[id] === 1) return;
        W.ch[id] = 1;
        this.emit({ k: "item", who: from, item: L.chests[id].item, id });
        break;
      }
      case "pint": {
        const i = W.pk.findIndex((p) => p[0] === d.id);
        if (i < 0) return;
        W.pk.splice(i, 1);
        this.emit({ k: "pint", who: from });
        break;
      }
      case "rev":
        this.emit({ k: "rev", who: String(d.who), by: from });
        break;
      case "heal":
        this.emit({ k: "heal", by: from, x: +d.x || 0, z: +d.z || 0 });
        return;
      case "down": {
        if (W.gate !== 1) return;
        const ex = this.level!.exit;
        const party = this.party();
        const near = party.filter((p) => Math.hypot(p.x - ex.x, p.z - ex.z) < 7).length;
        if (near < party.length) { this.emit({ k: "wait", n: near, of: party.length, to: from }); return; }
        if (L.boss) { W.ph = 2; W.end = Date.now(); this.emit({ k: "win" }); }
        else {
          W.depth++;
          W.ps = []; W.ch = []; W.gate = 0; W.pk = [];
          this.applyWorld(W);
        }
        break;
      }
      case "again":
        if (W.ph !== 0) { this.newRun(); return; }
        break;
      default: return;
    }
    this.applyWorld(W);
    this.sendWorld();
  }

  /** Everyone on this level who's still in the run. */
  private party(): { id: string; x: number; z: number; down: boolean; batSafe: boolean }[] {
    const out = [{ id: this.selfId, x: this.player.pos.x, z: this.player.pos.z, down: this.down, batSafe: this.S.batSafe }];
    const now = performance.now();
    for (const r of this.remotes.values()) {
      if (now - r.last > 4000 || r.run !== this.W?.run || r.depth !== this.W?.depth) continue;
      out.push({ id: r.id, x: r.x, z: r.z, down: r.down, batSafe: false });
    }
    return out;
  }

  private applyHit(id: number, dmg: number, from: string, weak = false) {
    const m = this.horde?.sims.find((s) => s.id === id);
    if (!m || m.state === 3 || !this.W) return;
    // under the lava, it can't be got at
    if (m.move === MOVE.UNDER) return;
    m.hp -= Math.max(0, Math.min(weak ? 400 : 200, dmg | 0));
    if (m.state === 0) m.state = 1;
    // its weakness: it staggers (now and then), and everyone hears about it
    if (weak && m.hp > 0 && (this.weakT.get(id) ?? 0) < this.clock) {
      if (stagger(m, { hurt: () => {}, zap: () => {}, spawn: () => {}, sound: () => {}, event: (ev) => this.emit(ev) })) {
        this.weakT.set(id, this.clock + 5);
        this.emit({ k: "weak", id, by: from, kind: m.kind, mini: m.mini ? 1 : 0 });
      }
    }
    if (m.hp > 0) return;
    m.hp = 0;
    m.state = 3;
    m.move = 0;
    this.W.k++;
    this.emit({ k: "kill", id, by: from, kind: m.kind, mini: m.mini ? 1 : 0 });
    if (guards(m)) {
      // the rest give up when a boss dies
      for (const s of this.horde!.sims) if (s !== m && s.state !== 3 && Math.hypot(s.x - m.x, s.z - m.z) < (m.mini ? 14 : 24)) {
        s.state = 3; s.hp = 0;
        // a champion carrying the key still drops it where it falls
        if (s.champ) this.puzzles?.dropKey(this.W.ps, s.x, s.z, this.hostCtx);
        this.emit({ k: "kill", id: s.id, by: from, kind: s.kind, mini: s.mini ? 1 : 0 });
      }
      this.checkGate();
    } else if (m.champ) {
      this.puzzles?.dropKey(this.W.ps, m.x, m.z, this.hostCtx);
    } else if (Math.random() < 0.22) {
      this.W.pk.push([this.nextPint++, Math.round(m.x * 10) / 10, Math.round(m.z * 10) / 10]);
    }
    this.applyWorld(this.W);
    this.sendWorld();
  }

  private hostUpdate(dt: number) {
    const W = this.W;
    if (!W) {
      // just arrived with friends here: give them a moment to send their mine before starting a new one
      if (this.peers().some((id) => !this.remotes.get(id)?.heard) && (this.waitW += dt) < 3) return;
      this.newRun();
      return;
    }
    if (!this.wasHost) {
      // taking over: carry on from the last list of monsters we heard
      if (this.level && this.lastMobs.length) {
        const sims = unpack(this.lastMobs);
        this.horde = this.makeHorde(sims);
        this.nextMob = sims.reduce((a, s) => Math.max(a, s.id + 1), 0);
        // the level's spawns that are already out, so the next player to join doesn't set them all off again
        this.spawned = new Set(sims.map((s) => s.id).filter((id) => id < this.L!.spawns.length));
      } else if (!this.horde) this.startHorde();
    }
    if (!this.horde) this.startHorde();
    const party = this.party();
    if (W.ph === 0 && this.horde) {
      const prey: Prey[] = party.filter((p) => !p.down);
      this.horde.update(dt, prey, {
        hurt: (id, dmg, m) => { if (id === this.selfId) this.takeHit(dmg, m.id); else this.net.send("mhurt", [dmg, m.id], id); },
        zap: (m, id, hit) => this.emit({ k: "zap", id: m.id, to: id, hit: hit ? 1 : 0 }),
        spawn: (kind, x, z) => this.hostCtx.spawn(kind, x, z),
        sound: () => {},
        event: (ev) => this.emit(ev),
      });
      if (this.puzzles && this.puzzles.tick(W.ps, dt, this.hostCtx)) {
        this.checkGate();
        this.applyWorld(W);
        this.sendWorld();
      }
      // everyone down: the run's over
      if (party.every((p) => p.down)) {
        W.ph = 1; W.end = Date.now();
        this.emit({ k: "wipe" });
        this.applyWorld(W);
        this.sendWorld();
      }
    }
    if (W.ph === 1) {
      this.wipeT += dt;
      if (this.wipeT > WIPE_WAIT) { this.wipeT = 0; this.newRun(); }
    } else this.wipeT = 0;
    this.mobT -= dt;
    if (this.mobT <= 0 && this.horde) { this.mobT = MOB_EVERY; this.lastMobs = this.horde.pack(); this.net.send("mob", this.lastMobs); }
    this.mwT -= dt;
    if (this.mwT <= 0) this.sendWorld();
    if (this.horde) this.syncMobs(this.horde.sims);
  }

  // ---- everyone's side -----------------------------------------------------------------------------------

  private onEvent(d: any) {
    const who = (id: string) => id === this.selfId ? "You" : esc(this.remotes.get(id)?.name ?? "Someone");
    const colour = (id: string) => id === this.selfId ? "#ffdd00" : this.remotes.get(id)?.colour ?? "#fff";
    const tag = (id: string) => `<b style="color:${colour(id)}">${who(id)}</b>`;
    switch (d?.k) {
      case "pz": {
        const line = this.puzzles?.onEvent(d, (x, z) => this.panTo(x, z)) ?? "";
        if (d.e === "solve") { this.toast(line, 3); this.feed(line); }
        else if (line) this.feed(d.who && d.e !== "wrong" ? `${tag(d.who)}: ${esc(line)}` : esc(line));
        break;
      }
      case "zap": {
        const m = this.mobs.get(d.id);
        if (!m) break;
        const to = d.to === this.selfId ? this.camera.position.clone().setY(this.camera.position.y - 0.3) : (() => { const r = this.remotes.get(d.to); return r ? new THREE.Vector3(r.avatar.x, r.avatar.y + 1.3, r.avatar.z) : null; })();
        if (!to) break;
        const from = new THREE.Vector3(m.x, m.view.group.position.y + (MOBS[m.kind].fly ? 0 : MOBS[m.kind].h * 0.7), m.z);
        if (!d.hit) to.add(new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5), (Math.random() - 0.5) * 2));
        this.zapFx(from, to, MOBS[m.kind].ranged?.fx ?? (m.kind === "wisp" ? "#9fd8ff" : "#d8ff6a"));
        const pan = this.panTo(m.x, m.z);
        SFX.zap(pan.d, pan.p);
        break;
      }
      case "bfx":
        this.bossFx.add(d);
        break;
      case "bphase": {
        const m = this.mobs.get(d.id);
        const name = m ? bossName(m) : "The boss";
        const line: Record<string, string> = {
          grout: "heaves, and calls up its blobs", engine: "groans, and something stirs in the water", wyrm: "roars, and embers come alive in the lava",
          rime: "shatters its shell of ice, and comes on faster", owner: "wails, and the dead answer him",
          spider: "spills out her young", ghoul: "calls up his gang",
        };
        const l = line[d.kind] ?? "rages";
        this.toast(`${name} ${l}`, 3);
        this.feed(`<b>${esc(name)}</b> ${esc(l)}`);
        break;
      }
      case "weak": {
        const m = this.mobs.get(d.id);
        const it = m ? weaknessOf(m) : undefined;
        if (!m || !it) break;
        const l = `${bossName(m)} ${WEAK_LINE[it] ?? "staggers"}`;
        this.toast(l, 2.5);
        this.feed(`${tag(d.by)}: ${esc(l)}`);
        SFX.impact("body", 0, 0, true);
        break;
      }
      case "gate":
        SFX.door();
        this.toast(this.L?.boss ? "Daylight! The shaft to the surface is open" : "The grille over the winze has swung open", 4);
        break;
      case "item": {
        const r = RELICS[d.item];
        if (!r) break;
        SFX.pickup("fizz");
        // everyone sees it come up out of the chest and go to whoever opened it
        this.flyItem(String(d.item), String(d.who), d.id | 0);
        if (d.who === this.selfId) {
          this.gain(d.item);
          this.pickupCard(d.item);
        }
        this.feed(`${tag(d.who)} found ${r.cursed ? "<i>" : ""}${esc(r.name)}${r.cursed ? "</i>" : ""}`);
        break;
      }
      case "pint":
        if (d.who === this.selfId) { this.hp = Math.min(this.S.maxHp, this.hp + 35); SFX.pickup("pint"); this.toast("A pint: 35 health", 1.5); }
        break;
      case "kill": {
        const m = this.mobs.get(d.id);
        if (m) {
          if (m.state !== 3) { const pan = this.panTo(m.x, m.z); SFX.groan(pan.d, pan.p, d.id); }
          m.state = 3;
        }
        if (d.by === this.selfId) SFX.kill();
        if (isBoss(d.kind) || d.mini) {
          const name = bossName({ kind: d.kind, mini: !!d.mini });
          this.feed(`${tag(d.by)} finished off <b>${esc(name)}</b>`);
          this.toast(`${name} is dead${this.L?.boss ? ". The way out is open" : ""}`, 4);
        }
        break;
      }
      case "rev":
        if (d.who === this.selfId && this.down) {
          this.down = false;
          this.hp = Math.round(this.S.maxHp * 0.35);
          this.toast(`${this.remotes.get(d.by)?.name ?? "Someone"} picked you up`, 2.5);
        }
        this.feed(`${tag(d.by)} picked up ${tag(d.who)}`);
        break;
      case "heal": {
        const p = this.player.pos;
        const pan = this.panTo(d.x, d.z);
        if (pan.d < 25) SFX.pickup("boost");
        this.flashLight(d.x, d.z);
        if (!this.down && Math.hypot(p.x - d.x, p.z - d.z) < HEAL_RANGE && this.hp < this.S.maxHp) {
          this.hp = Math.min(this.S.maxHp, this.hp + HEAL_AMOUNT);
          if (d.by !== this.selfId) this.toast(`${this.remotes.get(d.by)?.name ?? "Someone"}'s light heals you`, 1.5);
        }
        break;
      }
      case "wait":
        if (d.to === this.selfId) this.toast(`Everyone has to be at the winze (${d.n} of ${d.of} here)`, 3);
        break;
      case "win":
        SFX.kill();
        break;
      case "wipe":
        this.toast("The whole party is down", 4);
        break;
    }
  }

  private gain(item: string) {
    const r = RELICS[item];
    if (!r) return;
    if (r.once) {
      if (item === "fizz") this.hp = this.S.maxHp;
      if (item === "lucozade") this.lucoUntil = this.clock + 30;
      return;
    }
    const before = this.S.maxHp;
    this.relics.push(item);
    this.S = stats(this.relics, this.cls);
    // a new weapon goes straight into your hands; the old one stays on your belt
    if (item in WEAPONS) this.equip(item);
    if (this.S.maxHp > before) this.hp += this.S.maxHp - before;
    this.hp = Math.min(this.hp, this.S.maxHp);
    if (this.hp <= 0) this.hp = 1;
    this.renderInv(item);
  }

  // ---- what you carry --------------------------------------------------------------------------------

  private get loadout() { return loadout(this.relics, this.cls); }
  private get weapon() { return WEAPONS[this.held] ?? WEAPONS.pick; }

  /** Take something from your belt into your hands. */
  private equip(id: string) {
    if (id === this.held || !this.loadout.includes(id)) return;
    this.held = id;
    this.drawF = 0;
    this.swingHit = -1;
    this.swingCd = Math.max(this.swingCd, 0.25);
    this.view.hold(id);
    SFX.equip("fists");
    this.renderInv();
    this.stT = 0;
  }
  /** Keys 1 to 4. */
  private select(k: number) { const l = this.loadout; if (k < l.length) this.equip(l[k]); }
  /** The mouse wheel: the next or the one before, round and round. */
  private cycle(dir: number) {
    const l = this.loadout, k = l.indexOf(this.held);
    this.equip(l[(k + dir + l.length) % l.length]);
  }

  /** One inventory slot: an icon, a key number or a stack count, and data for the tooltip. */
  private slot(id: string, o: { n?: number; key?: number; held?: boolean; fresh?: boolean } = {}) {
    const r = RELICS[id];
    const cls = ["slot", o.key ? "weapon" : "", o.held ? "held" : "", r?.cursed ? "cursed" : "", o.fresh ? "fresh" : ""].filter(Boolean).join(" ");
    return `<div class="${cls}" data-id="${esc(id)}"><img src="${iconURL(id)}" alt="${esc(r?.name ?? heldName(id))}" draggable="false">`
      + (o.key ? `<i>${o.key}</i>` : "") + (o.n && o.n > 1 ? `<b>${o.n}</b>` : "") + `</div>`;
  }

  /** Your belt (what you can hold, keys 1 to 4) and your pack (relics, stacked). */
  private invHtml(fresh = "") {
    const belt = this.loadout.map((id, k) => this.slot(id, { key: k + 1, held: id === this.held, fresh: id === fresh }));
    // empty hooks on the belt, so you can see there's room for more
    for (let k = belt.length; k < 4; k++) belt.push(`<div class="slot empty"><i>${k + 1}</i></div>`);
    const counts = new Map<string, number>();
    for (const r of this.relics) if (!(r in WEAPONS)) counts.set(r, (counts.get(r) ?? 0) + 1);
    const pack = [...counts].map(([id, n]) => this.slot(id, { n, fresh: id === fresh }));
    return `<div class="belt">${belt.join("")}</div>` + (pack.length ? `<div class="pack">${pack.join("")}</div>` : "");
  }

  private renderInv(fresh = "") {
    const html = this.invHtml(fresh);
    $("relics").innerHTML = html;
    $("pauseinv").innerHTML = `<div class="invhead">Your pack <small>Click a weapon to hold it</small></div>` + this.invHtml();
  }

  /** Hover over any slot (paused, or on the summary) for its name and what it does. */
  private initTooltip() {
    const tip = document.createElement("div");
    tip.id = "invtip";
    tip.hidden = true;
    document.body.append(tip);
    const slotAt = (e: Event) => (e.target as HTMLElement | null)?.closest?.(".slot[data-id]") as HTMLElement | null;
    addEventListener("mouseover", (e) => {
      const el = slotAt(e);
      if (!el) { tip.hidden = true; return; }
      const id = el.dataset.id!, r = RELICS[id], w = WEAPONS[id];
      const what = w ? `Hits for ${w.dmg}${w.cleave ? ", everything in front of you" : ""}, ${w.cd < 0.4 ? "very fast" : w.cd > 0.8 ? "slow" : "quick"}`
        : id === "bow" ? "Hold to draw, let go to loose" : id === "fire" ? "Fire bolts, and right click for a healing light" : r?.blurb ?? "";
      const key = el.closest("#sumrelics") ? "" : el.querySelector("i")?.textContent;
      tip.innerHTML = `<b>${esc(r?.name ?? heldName(id))}</b><span>${esc(r && !w ? r.blurb : what)}</span>${key ? `<em>Press ${key} to hold</em>` : ""}`;
      tip.classList.toggle("cursed", !!r?.cursed);
      tip.hidden = false;
      const b = el.getBoundingClientRect();
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      tip.style.left = `${Math.max(6, Math.min(innerWidth - tw - 6, b.left + b.width / 2 - tw / 2))}px`;
      tip.style.top = `${b.top - th - 8 < 6 ? b.bottom + 8 : b.top - th - 8}px`;
    });
    addEventListener("click", (e) => {
      const el = slotAt(e);
      if (el?.classList.contains("weapon") && el.closest("#pauseinv")) this.equip(el.dataset.id!);
    });
  }

  /** The big card for something you've just found. */
  private pickupCard(item: string) {
    const r = RELICS[item];
    if (!r) return;
    ($("pkimg") as HTMLImageElement).src = iconURL(item);
    $("pkname").textContent = r.name;
    $("pkblurb").textContent = r.blurb;
    const k = this.loadout.indexOf(item);
    $("pkhint").textContent = item in WEAPONS ? `In your hands now. ${k + 1} or the mouse wheel to switch` : r.once ? "Used on the spot" : r.cursed ? "Cursed. It won't come off" : "In your pack";
    const card = $("pickup");
    card.classList.toggle("cursed", !!r.cursed);
    card.classList.remove("show");
    void card.offsetWidth;   // restart the pop
    card.classList.add("show");
    this.cardT = 4.2;
    this.toastT = 0;   // the card takes the toast's place
  }

  // ---- found things flying out of chests ---------------------------------------------------------------

  private texFor(item: string) {
    let t = this.iconTex.get(item);
    if (!t) {
      t = new THREE.CanvasTexture(iconCanvas(item));
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      t.colorSpace = THREE.SRGBColorSpace;
      this.iconTex.set(item, t);
    }
    return t;
  }

  private flyItem(item: string, who: string, chestId: number) {
    const lv = this.level, c = lv?.chests[chestId];
    if (!lv) return;
    const src = c ?? (who === this.selfId ? { x: this.player.pos.x, z: this.player.pos.z } : null);
    if (!src) return;
    const y = lv.ground(src.x, src.z);
    const o = new THREE.Group();
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.boltTex, color: RELICS[item]?.cursed ? "#ff3a2a" : "#ffc860", depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    glow.scale.setScalar(1.3);
    const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texFor(item), transparent: true, alphaTest: 0.5, fog: false, toneMapped: false }));
    o.add(glow, icon);
    o.position.set(src.x, y + 0.5, src.z);
    o.scale.setScalar(0.15);
    this.scene.add(o);
    this.flyers.push({ o, icon, glow, t: 0, from: new THREE.Vector3(src.x, y + 0.5, src.z), hover: new THREE.Vector3(src.x, y + 1.55, src.z), who, item });
  }

  private dropFlyer(f: Flyer) {
    this.scene.remove(f.o);
    (f.icon.material as THREE.Material).dispose();
    (f.glow.material as THREE.Material).dispose();
  }

  /** Up out of the chest, a moment hanging in the air, then off into the finder's pack. */
  private updateFlyers(dt: number) {
    const RISE = 0.7, HANG = 0.55, FLY = 0.45;
    for (let k = this.flyers.length - 1; k >= 0; k--) {
      const f = this.flyers[k];
      f.t += dt;
      const p = f.o.position;
      if (f.t < RISE) {
        const u = 1 - Math.pow(1 - f.t / RISE, 3);
        p.lerpVectors(f.from, f.hover, u);
        f.o.scale.setScalar(0.15 + 0.3 * u + 0.08 * Math.sin(u * Math.PI));
      } else if (f.t < RISE + HANG) {
        p.copy(f.hover);
        p.y += Math.sin((f.t - RISE) * 7) * 0.04;
        f.o.scale.setScalar(0.45);
      } else {
        // into your pack (bottom left of your view), or towards a friend
        const u = Math.min(1, (f.t - RISE - HANG) / FLY), e = u * u;
        let to: THREE.Vector3 | null = null;
        if (f.who === this.selfId) {
          const cam = this.camera, fwd = cam.getWorldDirection(new THREE.Vector3());
          const right = new THREE.Vector3().crossVectors(fwd, cam.up).normalize();
          to = cam.position.clone().addScaledVector(fwd, 0.7).addScaledVector(right, -0.42).addScaledVector(cam.up, -0.3);
        } else {
          const r = this.remotes.get(f.who);
          if (r?.avatar.root.visible) to = new THREE.Vector3(r.avatar.x, r.avatar.y + 1.2, r.avatar.z);
        }
        to ??= f.hover.clone().setY(f.hover.y + 1.5);
        p.lerpVectors(f.hover, to, e);
        f.o.scale.setScalar(0.45 * (1 - e) + (f.who === this.selfId ? 0.05 : 0.15) * e);
        if (u >= 1) { this.dropFlyer(f); this.flyers.splice(k, 1); continue; }
      }
      (f.glow.material as THREE.SpriteMaterial).opacity = 0.55 + 0.25 * Math.sin(f.t * 9);
    }
  }

  private takeHit(dmg: number, mobId: number) {
    if (this.down || !this.W || this.W.ph !== 0) return;
    this.hp -= dmg;
    this.hurtT = 0.4;
    SFX.hurt();
    if (this.hp <= 0) {
      this.hp = 0;
      this.down = true;
      this.reviving = "";
      const m = this.mobs.get(mobId);
      this.toast(`${m ? MOBS[m.kind].name : "Something"} got you. Shout: a friend can pick you up`, 4);
    }
    this.sendState();
  }

  private onHello(d: any, from: string) {
    const r = this.remote(from);
    if (d?.mines && this.arrivals.delete(from)) {
      // a player, not a lookup: send them our mic, and the level and monsters if we're hosting (and bring in the monsters their party size unlocks)
      this.voice.join(from);
      if (this.isHost && this.W) { this.reinforce(); this.net.send("mw", this.W, from); this.net.send("mob", this.horde?.pack() ?? [], from); }
    }
    const name = String(d?.name || "Player").slice(0, 16);
    if (r.name !== name) {
      const isNew = r.name === "";
      r.name = name;
      r.avatar.setName(name, r.colour);
      if (isNew) this.feed(`<b style="color:${r.colour}">${esc(name)}</b> came down the mine${CLASSES[d?.cls as ClassId] ? ` as ${esc(CLASSES[d.cls as ClassId].name)}` : ""}`);
    }
  }

  private remote(id: string): Remote {
    this.known.add(id);
    let r = this.remotes.get(id);
    if (!r) {
      const colour = colourFor(id);
      r = { id, name: "", colour, avatar: new Avatar("…", colour, id), last: performance.now(), x: 0, y: 0, z: 0, hp: 100, max: 100, down: false, depth: 0, run: 0, held: "", hand: new THREE.Group() };
      this.remotes.set(id, r);
      this.scene.add(r.avatar.root);
      // the street game's avatars carry a gun; down here they carry what they're holding instead
      r.avatar.armed = false;
      r.avatar.root.add(r.hand);
      this.setRemoteHeld(r, "pick");
      // heard from them before their name: ask for it
      this.net.send("hello", { name: this.name, mines: 1, cls: this.cls, ask: 1 }, id);
    }
    return r;
  }

  private onState(d: number[], from: string) {
    if (!Array.isArray(d) || d.length < 12) return;
    const r = this.remote(from);
    const [x, y, z, yaw, pitch, crouch, hp, down, talk, depth, max, run, held, born] = d;
    r.last = performance.now();
    if (held !== undefined) this.setRemoteHeld(r, HELD_KINDS[held] ?? "pick");
    Object.assign(r, { x, y, z, hp, max, down: down === 1, depth, run, heard: true, born: born ?? 0 });
    this.voice.heard(from, talk);
    r.avatar.alive = down !== 1;
    r.avatar.push({ t: performance.now(), x, y, z, yaw, pitch, crouch });
  }

  /** Put a model of what they're holding in a friend's right hand. */
  private setRemoteHeld(r: Remote, kind: string) {
    if (r.held === kind) return;
    r.held = kind;
    for (const c of [...r.hand.children]) {
      r.hand.remove(c);
      c.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
    }
    const m = heldModel(kind);
    if (kind === "bow") { m.position.set(0.32, 1.2, -0.28); m.rotation.set(0, 0.3, 0.1); }
    else if (kind === "fire") { m.position.set(0.3, 0.55, -0.15); m.rotation.set(1.35, 0, 0); m.scale.setScalar(0.85); }
    else { m.position.set(0.28, 1.0, -0.12); m.rotation.set(1.0, 0, -0.15); m.scale.setScalar(0.95); }
    r.hand.add(m);
  }

  private sendState() {
    const p = this.player.pos;
    this.net.send("st", [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100, Math.round(p.z * 100) / 100,
      Math.round(this.player.yaw * 1000) / 1000, Math.round(this.player.pitch * 1000) / 1000, Math.round(this.player.crouch * 100) / 100,
      Math.ceil(this.hp), this.down ? 1 : 0, this.voice.mode, this.W?.depth ?? 0, this.S.maxHp, this.W?.run ?? 0, Math.max(0, HELD_KINDS.indexOf(this.held)), this.W?.born ?? 0]);
    this.stT = ST_EVERY;
  }

  /** Bring the drawn monsters in line with a list (the host's own, or the last one it sent). */
  private syncMobs(list: MobSim[]) {
    const keep = new Set<number>();
    for (const s of list) {
      keep.add(s.id);
      let m = this.mobs.get(s.id);
      if (!m) {
        const view = new MobView(s.kind, { champion: s.champ, mini: s.mini });
        const y0 = this.level ? (MOBS[s.kind].ceiling && s.state === 0 ? this.level.roofAt(s.x, s.z) - 0.6 : this.level.ground(s.x, s.z)) : 0;
        m = { id: s.id, kind: s.kind, champ: s.champ, mini: s.mini, view, x: s.x, y: y0, z: s.z, yaw: s.yaw, tx: s.x, tz: s.z, tyaw: s.yaw, hp: s.hp, max: s.max, state: s.state, speed: 0, move: s.move, phase: s.phase };
        this.mobs.set(s.id, m);
        this.scene.add(view.group);
      }
      // sounds come from how they change, so everyone hears the same thing
      const pan = this.panTo(s.x, s.z);
      if (m.state === 0 && s.state === 1) SFX.shout(pan.d, pan.p, s.id);
      if (m.state === 2 && s.state === 1) SFX.grunt(pan.d, pan.p, s.id);
      if (s.hp < m.hp && s.state !== 3) m.view.flash();
      if (m.state !== 3 && s.state === 3) SFX.groan(pan.d, pan.p, s.id);
      m.tx = s.x; m.tz = s.z; m.tyaw = s.yaw; m.hp = s.hp; m.max = s.max; m.state = s.state; m.move = s.move; m.phase = s.phase;
    }
    for (const [id, m] of this.mobs) if (!keep.has(id)) { this.scene.remove(m.view.group); m.view.dispose(); this.mobs.delete(id); }
  }

  private panTo(x: number, z: number) {
    const p = this.player.pos, dx = x - p.x, dz = z - p.z;
    const right = { x: Math.cos(this.player.yaw), z: -Math.sin(this.player.yaw) };
    const d = Math.hypot(dx, dz);
    return { d, p: d > 0.1 ? (dx * right.x + dz * right.z) / d : 0 };
  }

  // ---- doing things -----------------------------------------------------------------------------------

  private ask(d: any) {
    if (this.isHost) this.applyUse(d, this.selfId);
    else this.net.send("muse", d, this.hostId);
  }

  /** What E would do right now, if anything. */
  private target(): { text: string; act?: () => void; hold?: string; pump?: { id: number; a: string } } | null {
    const lv = this.level, W = this.W;
    if (!lv || !W || this.down || W.ph !== 0) return null;
    const p = this.player.pos, fx = -Math.sin(this.player.yaw), fz = -Math.cos(this.player.yaw);
    const near = (x: number, z: number, reach = 2.3) => {
      const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
      return d < 1.2 || (d < reach && (dx * fx + dz * fz) / d > 0.4);
    };
    for (const r of this.remotes.values()) {
      if (r.down && r.depth === W.depth && r.run === W.run && near(r.x, r.z, 2.5)) return { text: `Hold <b>E</b> to pick up ${esc(r.name)}`, hold: r.id };
    }
    // puzzle parts: the one you're looking most squarely at
    if (this.puzzles) {
      const cam = this.camera.position, look = this.camera.getWorldDirection(new THREE.Vector3());
      let best: Target | null = null, bestA = 0.55;
      for (const t of this.puzzles.targets(W.ps)) {
        const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz);
        if (d > (t.reach ?? 2.4)) continue;
        const v = new THREE.Vector3(t.x - cam.x, t.y - cam.y, t.z - cam.z);
        const a = v.angleTo(look) * (d < 1 ? 0.6 : 1);
        if (a < bestA) { bestA = a; best = t; }
      }
      if (best) {
        const t = best;
        if (t.hold) return { text: t.text, pump: t.use };
        return { text: t.text, act: t.use ? () => this.ask({ k: "pz", ...t.use }) : undefined };
      }
    }
    for (let k = 0; k < lv.chests.length; k++) {
      const c = lv.chests[k];
      if (!c.opened && near(c.x, c.z)) return { text: "<b>E</b> Open the chest", act: () => this.ask({ k: "chest", id: k }) };
    }
    if (near(lv.exit.x, lv.exit.z, 2.8)) {
      if (W.gate === 1) return { text: this.L!.boss ? "<b>E</b> Climb out into the daylight" : "<b>E</b> Climb down the winze", act: () => this.ask({ k: "down" }) };
      const g = [...this.mobs.values()].find((m) => guards(m) && m.state !== 3);
      if (this.L!.boss || (g && W.ps.every((s) => s[0] === 1))) return { text: `${g ? esc(bossName(g)) : "Something"} has the way ${this.L!.boss ? "out" : "down"} blocked` };
      const left = W.ps.filter((s) => s[0] !== 1).length;
      return { text: `The grille is locked: ${left} puzzle${left === 1 ? "" : "s"} still to solve (top left)` };
    }
    return null;
  }

  private use() {
    const t = this.target();
    t?.act?.();
  }

  private swing() {
    const w = this.weapon;
    this.swingCd = w.cd;
    this.swingHit = 0.16;
    this.view.swing(w.cd);
    SFX.swing();
  }

  /** The swing lands: hit whatever's in front of you. */
  private land() {
    const w = this.weapon, p = this.player.pos, lv = this.level;
    if (!lv) return;
    const fx = -Math.sin(this.player.yaw), fz = -Math.cos(this.player.yaw);
    const hit: { m: Mob; d: number }[] = [];
    for (const m of this.mobs.values()) {
      if (m.state === 3 || m.move === MOVE.UNDER) continue;
      const dx = m.x - p.x, dz = m.z - p.z, d = Math.hypot(dx, dz);
      const mr = radius(m);
      if (d > w.reach + mr) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / Math.max(d, 1e-3))));
      if (d > mr + 0.3 && ang > w.arc / 2 + Math.atan2(mr, d)) continue;
      if (!lv.los(p.x, p.z, m.x, m.z)) continue;
      hit.push({ m, d });
    }
    if (!hit.length) {
      // a clang off the rock if you swung at a wall
      if (lv.rayToRock(p.x, p.z, fx, fz, w.reach) < w.reach) SFX.impact("building", 0.5);
      return;
    }
    hit.sort((a, b) => a.d - b.d);
    for (const { m } of w.cleave ? hit : hit.slice(0, 1)) { this.hitMob(m, w.dmg); SFX.punch(0, 0); }
  }

  /** You hit a monster: your relics decide how hard, the host decides what happens. */
  private hitMob(m: Mob, base: number) {
    this.hits++;
    const crit = this.S.crit > 0 && this.hits % Math.round(1 / this.S.crit) === 0;
    // carrying what a boss can't stand: double damage, and it staggers
    const it = weaknessOf(m), weak = !!it && this.relics.includes(it);
    const dmg = Math.round(base * this.S.dmg * (this.clock < this.lucoUntil ? 2 : 1) * (crit ? 3 : 1) * (weak ? WEAK_DMG : 1));
    if (this.isHost) this.applyHit(m.id, dmg, this.selfId, weak);
    else this.net.send("mhit", weak ? [m.id, dmg, 1] : [m.id, dmg], this.hostId);
    m.view.flash();
    this.hitT = crit ? 0.3 : 0.15;
    $("hitmarker").classList.toggle("head", crit);
    if (this.S.heal) this.hp = Math.min(this.S.maxHp, this.hp + this.S.heal);
  }

  // ---- bows and magic ---------------------------------------------------------------------------------

  /** Pick who you go down as. */
  setClass(c: ClassId) {
    this.cls = c;
    this.S = stats(this.relics, c);
    this.hp = this.S.maxHp;
    this.mana = MANA;
    this.held = CLASS_WEAPON[c];
    this.view.setClass(c);
    this.renderInv();
    this.net.send("hello", { name: this.name, mines: 1, cls: c });
  }
  get classId() { return this.cls; }

  private aim() {
    const dir = this.camera.getWorldDirection(new THREE.Vector3());
    const o = this.camera.position.clone().addScaledVector(dir, 0.45);
    o.y -= 0.08;
    return { o, dir };
  }

  /** Let an arrow go: the further you drew, the faster and harder. */
  private loose() {
    const { o, dir } = this.aim(), f = this.drawF;
    const v = dir.multiplyScalar(16 + 26 * f);
    this.fire("arrow", o.x, o.y, o.z, v.x, v.y, v.z, 7 + 25 * f, true);
    this.view.shoot();
    SFX.swing();
    this.swingCd = 0.3;
  }

  private manaWarnT = 0;
  private castBolt() {
    if (this.mana < BOLT_COST) {
      if (this.clock > this.manaWarnT) { this.toast("Out of mana", 1); this.manaWarnT = this.clock + 1.5; }
      return;
    }
    this.mana -= BOLT_COST;
    const { o, dir } = this.aim();
    const v = dir.multiplyScalar(15);
    this.fire("bolt", o.x, o.y, o.z, v.x, v.y, v.z, 18, true);
    this.view.shoot();
    SFX.swing();
    this.swingCd = 0.45;
  }

  /** Bladud's heir's right click: a light that heals everyone close by, you included. */
  private healLight() {
    if (this.cls !== "mage" || this.down || !this.W || this.W.ph !== 0) return;
    if (this.mana < HEAL_COST) { this.toast("Not enough mana for a healing light", 1.2); return; }
    this.mana -= HEAL_COST;
    this.view.shoot();
    this.ask({ k: "heal", x: Math.round(this.player.pos.x * 10) / 10, z: Math.round(this.player.pos.z * 10) / 10 });
  }

  private arrowGeo = new THREE.BoxGeometry(0.025, 0.025, 0.7).translate(0, 0, 0.35);
  private arrowMat = new THREE.MeshLambertMaterial({ color: "#6e5234" });
  private boltTex = glow();

  private fire(kind: Shot["kind"], x: number, y: number, z: number, vx: number, vy: number, vz: number, dmg: number, mine: boolean) {
    let o: THREE.Object3D;
    if (kind === "arrow") o = new THREE.Mesh(this.arrowGeo, this.arrowMat);
    else {
      o = new THREE.Group();
      const outer = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.boltTex, color: "#ff7a2a", depthWrite: false, blending: THREE.AdditiveBlending }));
      outer.scale.setScalar(0.9);
      const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.boltTex, color: "#fff2c0", depthWrite: false, blending: THREE.AdditiveBlending }));
      core.scale.setScalar(0.35);
      o.add(outer, core);
    }
    o.position.set(x, y, z);
    this.scene.add(o);
    this.shots.push({ kind, o, v: new THREE.Vector3(vx, vy, vz), dmg, mine, life: 3 });
    if (mine) {
      const r = (n: number) => Math.round(n * 100) / 100;
      this.net.send("mfx", [kind === "bolt" ? 1 : 0, r(x), r(y), r(z), r(vx), r(vy), r(vz), this.W?.depth ?? 0]);
    }
  }

  private updateShots(dt: number) {
    const lv = this.level;
    for (let k = this.shots.length - 1; k >= 0; k--) {
      const s = this.shots[k], p = s.o.position;
      if (s.kind === "arrow") s.v.y -= 5 * dt;
      p.addScaledVector(s.v, dt);
      s.life -= dt;
      if (s.kind === "arrow") s.o.lookAt(p.x + s.v.x, p.y + s.v.y, p.z + s.v.z);
      let done = s.life <= 0;
      let target: Mob | null = null;
      if (s.mine) for (const m of this.mobs.values()) {
        if (m.state === 3 || m.move === MOVE.UNDER) continue;
        const d = MOBS[m.kind], hh = d.h * (m.champ ? CHAMP.r : 1) * (m.mini ? 1.6 : 1), y0 = m.view.group.position.y - (d.fly ? hh / 2 : 0);
        if (Math.hypot(m.x - p.x, m.z - p.z) < radius(m) + 0.15 && p.y > y0 - 0.1 && p.y < y0 + hh + 0.1) { target = m; break; }
      }
      const rock = !lv || !lv.isOpen(Math.floor(p.x / CELL), Math.floor(p.z / CELL)) || p.y < lv.ground(p.x, p.z) + 0.03 || p.y > lv.roofAt(p.x, p.z);
      if (target || rock) {
        done = true;
        const pan = this.panTo(p.x, p.z);
        if (s.kind === "bolt") {
          // a fire bolt bursts: whatever it hit takes the lot, anything close by takes half
          this.flashLight(p.x, p.z, p.y);
          SFX.impact("building", pan.d, pan.p, true);
          if (s.mine) for (const m of this.mobs.values()) {
            if (m.state === 3) continue;
            if (m === target) this.hitMob(m, s.dmg);
            else if (Math.hypot(m.x - p.x, m.z - p.z) < 1.8 + radius(m)) this.hitMob(m, s.dmg / 2);
          }
        } else {
          SFX.impact(target ? "body" : "building", pan.d, pan.p);
          if (target) this.hitMob(target, s.dmg);
        }
      }
      if (done) { this.scene.remove(s.o); this.disposeShot(s.o); this.shots.splice(k, 1); }
    }
    this.fxLight.intensity = Math.max(0, this.fxLight.intensity - dt * 40);
  }

  private disposeShot(o: THREE.Object3D) {
    o.traverse((c) => { if ((c as THREE.Sprite).isSprite) ((c as THREE.Sprite).material as THREE.Material).dispose(); });
  }

  /** A burst of light: a fire bolt going off, or a healing light. */
  private flashLight(x: number, z: number, y = 1.6) {
    this.fxLight.position.set(x, y, z);
    this.fxLight.intensity = 9;
  }

  // ---- every frame -----------------------------------------------------------------------------------------

  update(dt: number) {
    this.clock += dt;
    const W = this.W;
    if (this.isHost) this.hostUpdate(dt);
    this.wasHost = this.isHost;
    if (!this.level || !W) { this.camera.position.set(0, 1.6, 0); return; }
    const lv = this.level;

    // you
    const playing = this.active && W.ph === 0;
    this.player.speedMul = this.down ? 0.22 : this.S.speed;
    {
      // wading, swimming and lava all slow you down
      const q = this.player.pos, low = q.y < lv.ground(q.x, q.z) + 0.3, wet = lv.water(q.x, q.z);
      if (low && lv.isLava(q.x, q.z)) this.player.speedMul *= 0.5;
      if (low && wet) this.player.speedMul *= wet === 4 ? 0.5 : 0.72;
    }
    this.player.crouchLatch = this.down;
    this.player.grip = lv.isIce(this.player.pos.x, this.player.pos.z) ? ICE_GRIP : 1;
    this.player.update(dt, playing);
    const pp = this.player.pos, floorY = lv.ground(pp.x, pp.z), roof = lv.roofAt(pp.x, pp.z);
    if (pp.y + this.player.eyeHeight + 0.15 > roof) {
      pp.y = Math.max(floorY, roof - this.player.eyeHeight - 0.15);
      this.player.vel.y = Math.min(0, this.player.vel.y);
    }
    // lava burns while you're in it
    const inLava = lv.isLava(pp.x, pp.z) && pp.y < floorY + 0.2;
    if (inLava && !this.down && W.ph === 0) this.burn(dt);
    else if (this.player.onGround && !inLava && !this.down) this.safe = { x: pp.x, z: pp.z };

    this.player.applyToCamera(this.camera);
    // steps up are instant underfoot; ease the camera up them instead of jumping
    const eye = this.camera.position.y;
    this.camY = Math.abs(eye - this.camY) > 1.5 || this.player.vel.y > 1 ? eye : this.camY + (eye - this.camY) * Math.min(1, dt * 14);
    this.camera.position.y = this.camY;
    if (this.player.onGround && this.player.speed > 0.5) {
      this.stepT -= dt * this.player.speed;
      if (this.stepT <= 0) { this.stepT = 2.1; SFX.step(true, 0.5); }
    }
    if (!this.down && W.ph === 0) this.hp = Math.min(this.S.maxHp, this.hp + this.S.regen * dt);

    // fighting: whatever's in your hands. Swing a melee weapon, draw and loose a bow, cast fire
    this.swingCd = Math.max(0, this.swingCd - dt);
    this.mana = Math.min(MANA, this.mana + MANA_REGEN * dt);
    const canFight = playing && !this.down && (this.freeLook || !!document.pointerLockElement);
    if (this.freeLook && playing) {
      if (this.mouseX < 0.06) this.player.yaw += dt * 2.2;
      else if (this.mouseX > 0.94) this.player.yaw -= dt * 2.2;
    }
    if (this.swingHit >= 0) { this.swingHit -= dt; if (this.swingHit < 0) this.land(); }
    if (this.held === "bow") {
      if (canFight && this.mouseDown && this.swingCd <= 0) this.drawF = Math.min(1, this.drawF + dt / DRAW_TIME);
      else if (this.drawF > 0) { if (canFight && this.drawF > 0.15) this.loose(); this.drawF = 0; }
      this.view.draw(this.drawF);
    } else if (this.held === "fire") {
      if (canFight && this.mouseDown && this.swingCd <= 0) this.castBolt();
    } else if (canFight && this.mouseDown && this.swingCd <= 0) this.swing();
    this.updateShots(dt);
    this.updateFlyers(dt);

    // E: things to use, friends to pick up
    const t = playing ? this.target() : null;
    this.pumpT -= dt;
    if (t?.pump && this.eDown && this.pumpT <= 0) { this.pumpT = 0.3; this.ask({ k: "pz", ...t.pump }); }
    // walk over the foreman's key to pick it up
    this.takeT -= dt;
    const keyId = this.puzzles && !this.down ? this.puzzles.keyUnder(W.ps, this.player.pos.x, this.player.pos.z) : -1;
    if (keyId >= 0 && this.takeT <= 0) { this.takeT = 0.5; this.ask({ k: "pz", id: keyId, a: "take" }); }
    if (t?.hold && this.eDown) {
      if (this.reviving !== t.hold) { this.reviving = t.hold; this.reviveT = 0; }
      this.reviveT += (dt * this.S.revive) / REVIVE_TIME;
      if (this.reviveT >= 1) { this.ask({ k: "rev", who: t.hold }); this.reviving = ""; this.reviveT = 0; }
    } else { this.reviving = ""; this.reviveT = 0; }
    let hint = t?.text ?? "";
    if (this.reviving) hint += ` <span class="prog"><i style="width:${Math.round(this.reviveT * 100)}%"></i></span>`;
    if (this.down && W.ph === 0) hint = "You're down. A friend can pick you up";
    $("usehint").innerHTML = hint;
    $("usehint").hidden = !hint;
    // walk over a pint to drink it
    for (const [id, o] of this.pints) {
      if (!this.down && Math.hypot(o.position.x - this.player.pos.x, o.position.z - this.player.pos.z) < 0.9 && this.hp < this.S.maxHp) {
        this.ask({ k: "pint", id });
        break;
      }
    }

    // monsters: ease towards where the host says they are
    for (const m of this.mobs.values()) {
      const k = Math.min(1, dt * (this.isHost ? 30 : 10));
      const ox = m.x, oz = m.z;
      m.x += (m.tx - m.x) * k; m.z += (m.tz - m.z) * k;
      let dy = m.tyaw - m.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      m.yaw += dy * k;
      m.speed = Math.hypot(m.x - ox, m.z - oz) / Math.max(dt, 1e-3);
      const def = MOBS[m.kind], g = lv.ground(m.x, m.z);
      // flyers bob along at head height; spiders hang from the roof till they drop
      const y = def.fly ? g + 1.4 + (m.state === 3 ? 0 : Math.sin(this.clock * 3 + m.id) * 0.25) : def.ceiling && m.state === 0 ? lv.roofAt(m.x, m.z) - 0.6 : g;
      m.y += (y - m.y) * Math.min(1, dt * (def.ceiling ? 6 : 12));
      m.view.group.position.set(m.x, m.y, m.z);
      m.view.group.rotation.y = m.yaw;
      m.view.update(dt, m.state, m.speed, this.clock, m.move, m.phase);
    }

    // other players
    const now = performance.now();
    for (const r of this.remotes.values()) {
      r.avatar.update(now, dt);
      r.avatar.root.visible = r.depth === W.depth && r.run === W.run && now - r.last < 5000 && (r.avatar.root.visible || !r.down);
      r.avatar.talking = this.voice.speaking(r.id);
      r.avatar.onRadio = this.voice.modeOf(r.id) === 2;
      r.hand.rotation.y = r.avatar.yaw;
      r.hand.visible = !r.down;
    }
    const cam = this.camera.position, fwd = this.camera.getWorldDirection(new THREE.Vector3());
    this.voice.update(cam.x, cam.y, cam.z, fwd.x, fwd.y, fwd.z, (id) => {
      const r = this.remotes.get(id);
      return r && r.depth === W.depth ? { x: r.avatar.x, y: r.avatar.y, z: r.avatar.z } : null;
    });

    this.updateLights(dt);
    lv.update(this.clock);
    this.bossFx.update(dt);
    this.puzzles?.update(dt, this.clock, W.ps, this.player.pos);
    for (let k = this.zaps.length - 1; k >= 0; k--) {
      const z = this.zaps[k];
      z.life -= dt;
      (z.o.material as THREE.MeshBasicMaterial).opacity = Math.max(0, z.life / 0.25);
      if (z.life <= 0) { this.scene.remove(z.o); z.o.geometry.dispose(); (z.o.material as THREE.Material).dispose(); this.zaps.splice(k, 1); }
    }
    for (const o of this.pints.values()) o.rotation.y += dt * 2;
    this.view.update(dt, this.camera, this.player.speed, this.down);

    this.stT -= dt;
    if (this.stT <= 0) this.sendState();
    this.updateMap(dt);
    this.updateHud(dt);
  }

  private updateLights(dt: number) {
    const lv = this.level!, cam = this.camera.position;
    const flick = 0.92 + 0.05 * Math.sin(this.clock * 13) + 0.03 * Math.sin(this.clock * 31);
    // held a little behind and above you, so walls right in front of you don't flare white
    this.torch.position.set(cam.x + Math.sin(this.player.yaw) * 0.45, cam.y + 0.2, cam.z + Math.cos(this.player.yaw) * 0.45);
    this.torch.distance = 12 * this.S.light;
    this.torch.intensity = (this.down ? 2 : 4.5) * flick * (this.S.light > 1 ? 1.6 : 1);
    this.lightT -= dt;
    if (this.lightT > 0) return;
    this.lightT = 0.3;
    // candles: the nearest few get a real light
    const all = this.W && this.puzzles ? lv.lamps.concat(this.puzzles.lights(this.W.ps)) : lv.lamps;
    const lamps = all.map((l) => ({ l, d: Math.hypot(l[0] - cam.x, l[2] - cam.z) })).sort((a, b) => a.d - b.d);
    this.lampLights.forEach((light, k) => {
      const l = lamps[k];
      if (l && l.d < 30) {
        // lava glows red from below; braziers throw a big warm light
        const kind = l.l[3] ?? 0;
        light.position.set(l.l[0], l.l[1] + (kind === 2 ? 1.9 : 0.2), l.l[2]);
        light.color.set(kind === 1 ? "#ff4a10" : kind === 2 ? "#ff9038" : this.lampTint);
        light.intensity = kind === 1 ? 3.2 : kind === 2 ? 4 : 2.2;
        light.distance = kind === 1 ? 13 : kind === 2 ? 18 : 10;
      } else light.intensity = 0;
    });
    // friends carry lights too
    const friends = [...this.remotes.values()].filter((r) => r.avatar.root.visible)
      .map((r) => ({ r, d: Math.hypot(r.avatar.x - cam.x, r.avatar.z - cam.z) })).sort((a, b) => a.d - b.d);
    this.friendLights.forEach((light, k) => {
      const f = friends[k];
      if (f) { light.position.set(f.r.avatar.x, f.r.avatar.y + 1.8, f.r.avatar.z); light.intensity = f.r.down ? 2 : 4.5; } else light.intensity = 0;
    });
  }

  private burnT = 0;
  /** The last solid ground you stood on: if the lava gets you, you're dragged back there to be picked up. */
  private safe = { x: 0, z: 0 };
  /** Standing in lava. */
  private burn(dt: number) {
    this.hp -= LAVA_BURN * dt;
    this.hurtT = 0.3;
    this.burnT -= dt;
    if (this.burnT <= 0) { this.burnT = 0.5; SFX.hurt(); this.toast("It burns! Get out of the lava", 1); }
    if (this.hp <= 0) {
      this.hp = 0;
      this.down = true;
      this.reviving = "";
      this.toast("The lava got you. A friend can pick you up", 4);
      const s = this.safe, lv = this.level;
      if (lv && (s.x || s.z)) this.player.pos.set(s.x, lv.ground(s.x, s.z), s.z);
      this.sendState();
    }
  }

  /** A gazer's or a wisp's bolt: a bright line that fades. */
  private zapFx(from: THREE.Vector3, to: THREE.Vector3, colour: string) {
    const len = from.distanceTo(to);
    const o = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, len).translate(0, 0, len / 2),
      new THREE.MeshBasicMaterial({ color: colour, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    o.position.copy(from);
    o.lookAt(to);
    this.scene.add(o);
    this.zaps.push({ o, life: 0.25 });
    this.flashLight(from.x, from.z, from.y);
  }

  // ---- the automap ------------------------------------------------------------------------------------------

  private updateMap(dt: number) {
    const L = this.L!, lv = this.level!, p = this.player.pos;
    this.seenT -= dt;
    if (this.seenT <= 0) {
      this.seenT = 0.2;
      const ci = Math.floor(p.x / CELL), cj = Math.floor(p.z / CELL), R = 5;
      for (let j = cj - R; j <= cj + R; j++) for (let i = ci - R; i <= ci + R; i++) {
        if (i < 0 || j < 0 || i >= L.w || j >= L.h) continue;
        const x = (i + 0.5) * CELL, z = (j + 0.5) * CELL;
        if (Math.hypot(x - p.x, z - p.z) > R * CELL) continue;
        // a wall cell counts as seen if you can see the open cell next to it
        if (lv.isOpen(i, j) ? lv.los(p.x, p.z, x, z) : [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => lv.isOpen(i + a, j + b) && lv.los(p.x, p.z, (i + a + 0.5) * CELL, (j + b + 0.5) * CELL))) this.seen[j * L.w + i] = 1;
      }
    }
    this.drawMap(this.mapCtx, 9, true);
    if (!$("bigmap").hidden) this.drawMap(this.bigCtx, 0, false);
  }

  /** Draw the map: around you (radius in cells) or the whole level (radius 0). */
  private drawMap(g: CanvasRenderingContext2D, radius: number, follow: boolean) {
    const L = this.L!, lv = this.level!, W = this.W!, c = g.canvas, p = this.player.pos;
    const span = radius ? radius * 2 + 1 : Math.max(L.w, L.h);
    const s = c.width / span;
    const ox = follow ? p.x / CELL - span / 2 : 0, oz = follow ? p.z / CELL - span / 2 : 0;
    const X = (x: number) => (x / CELL - ox) * s, Z = (z: number) => (z / CELL - oz) * s;
    g.fillStyle = "#1a140e";
    g.fillRect(0, 0, c.width, c.height);
    for (let j = Math.max(0, Math.floor(oz)); j < Math.min(L.h, oz + span + 1); j++) for (let i = Math.max(0, Math.floor(ox)); i < Math.min(L.w, ox + span + 1); i++) {
      if (!this.seen[j * L.w + i]) continue;
      const k = j * L.w + i;
      // higher floors drawn lighter, lava orange, ice pale blue
      g.fillStyle = !lv.isOpen(i, j) ? "#5b4a35" : L.surf[k] === 1 ? "#d0521a" : L.surf[k] === 2 ? "#a8d0e0"
        : `hsl(38, 30%, ${Math.max(35, Math.min(85, 66 + L.fl[k] * 9))}%)`;
      g.fillRect(Math.floor((i - ox) * s), Math.floor((j - oz) * s), Math.ceil(s), Math.ceil(s));
    }
    const dot = (x: number, z: number, r: number, col: string, seenOnly = true) => {
      if (seenOnly && !this.seen[Math.floor(z / CELL) * L.w + Math.floor(x / CELL)]) return;
      g.fillStyle = col;
      g.beginPath(); g.arc(X(x), Z(z), r, 0, Math.PI * 2); g.fill();
    };
    const r0 = Math.max(2.5, s * 0.35);
    // puzzles are marked whether you've been there or not
    for (const m of this.puzzles?.marks(W.ps) ?? []) {
      // off the edge of the little map: pinned to its rim, pointing the way
      const mx = X(m.x), mz = Z(m.z), e = r0 * 1.4;
      if (follow && (mx < e || mz < e || mx > c.width - e || mz > c.height - e)) {
        if (m.done || m.small) continue;
        g.fillStyle = "#e0462a";
        g.beginPath(); g.arc(Math.max(e, Math.min(c.width - e, mx)), Math.max(e, Math.min(c.height - e, mz)), r0 * 0.8, 0, Math.PI * 2); g.fill();
        continue;
      }
      dot(m.x, m.z, m.small ? r0 * 0.75 : r0 * 1.15, m.done ? "#6b8f5a" : m.small ? "#c79bff" : "#e0462a", false);
      if (!m.done && !m.small) { g.strokeStyle = "#fff"; g.lineWidth = 1; g.beginPath(); g.arc(X(m.x), Z(m.z), r0 * 1.15, 0, Math.PI * 2); g.stroke(); }
    }
    lv.chests.forEach((ch, k) => dot(ch.x, ch.z, r0, W.ch[k] === 1 ? "#6d5a40" : "#ffdd00"));
    dot(lv.exit.x, lv.exit.z, r0 * 1.4, W.gate === 1 ? "#7fd8ff" : "#2b5e73");
    for (const o of this.pints.values()) dot(o.position.x, o.position.z, r0 * 0.7, "#ff9f2e");
    if (this.S.echo) for (const m of this.mobs.values()) if (m.state !== 3) dot(m.x, m.z, r0 * 0.8, "#d13030", false);
    for (const r of this.remotes.values()) if (r.avatar.root.visible || r.down) dot(r.avatar.x, r.avatar.z, r0, r.colour, false);
    // you: an arrow
    g.save();
    g.translate(X(p.x), Z(p.z));
    g.rotate(-this.player.yaw);
    g.fillStyle = "#fff";
    g.beginPath(); g.moveTo(0, -r0 * 1.8); g.lineTo(r0 * 1.1, r0 * 1.2); g.lineTo(-r0 * 1.1, r0 * 1.2); g.closePath(); g.fill();
    g.restore();
  }

  // ---- the HUD -------------------------------------------------------------------------------------------------

  private objT = 0;
  private updateHud(dt: number) {
    const W = this.W!;
    // the boss's health
    const boss = [...this.mobs.values()].find((m) => guards(m) && m.state !== 3);
    const hp = Math.max(0, Math.ceil(this.hp));
    $("hpnum").textContent = String(hp);
    $("hpfill").style.width = `${(100 * hp) / this.S.maxHp}%`;
    $("health").classList.toggle("low", hp < 30);
    $("ammolabel").textContent = `${CLASSES[this.cls].name} · ${this.L!.name}`;
    this.objT -= dt;
    if (this.objT <= 0 && this.puzzles) {
      this.objT = 0.25;
      const list = this.puzzles.objectives(W.ps);
      const guard = this.L!.spawns.find((s) => guards(s));
      if (guard) list.push({ text: `Defeat ${bossName(guard)}`, done: !boss && this.mobs.size > 0 });
      const html = `<div class="head">${W.gate === 1 ? "The way on is open" : "To open the way on"}</div>` + list.map((o) => `<div class="${o.done ? "done" : ""}">${esc(o.text)}</div>`).join("");
      show($("objectives"), html);
    }
    $("ammonum").textContent = heldName(this.held);
    this.cardT -= dt;
    $("pickup").classList.toggle("show", this.cardT > 0);
    $("manabox").hidden = this.cls !== "mage";
    ($("manafill") as HTMLElement).style.width = `${(100 * this.mana) / MANA}%`;
    $("reloadmsg").textContent = this.clock < this.lucoUntil ? `Lucozade ${Math.ceil(this.lucoUntil - this.clock)}s` : "";
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.hitT = Math.max(0, this.hitT - dt);
    $("hitmarker").style.opacity = this.hitT > 0 ? "1" : "0";
    $("vignette").style.opacity = String(Math.max(this.hurtT * 2, this.down ? 0.8 : hp < 30 ? 0.35 : 0));
    this.toastT -= dt;
    $("toast").classList.toggle("show", this.toastT > 0);
    this.signT -= dt;
    $("where").style.opacity = this.signT > 0 ? "1" : "0";

    $("bossbar").hidden = !boss || Math.hypot(boss.x - this.player.pos.x, boss.z - this.player.pos.z) > 26;
    if (boss) {
      ($("bossfill") as HTMLElement).style.width = `${(100 * boss.hp) / boss.max}%`;
      const it = weaknessOf(boss), label = bossName(boss) + (it && this.relics.includes(it) ? ` · weak to your ${RELICS[it]?.name ?? it}` : "");
      const el = $("bossbar").querySelector("span")!;
      if (el.textContent !== label) el.textContent = label;
    }
    if (W.ph === 1) $("sumwait").textContent = `A fresh run starts in ${Math.max(0, Math.ceil(WIPE_WAIT - (Date.now() - W.end) / 1000))}…`;
  }

  private showSummary() {
    const W = this.W!;
    const mins = Math.max(0, Math.round((W.end - W.t0) / 60000));
    const time = mins < 1 ? "under a minute" : `${mins} minute${mins === 1 ? "" : "s"}`;
    const kills = `${W.k} monster${W.k === 1 ? "" : "s"}`;
    $("summary").hidden = false;
    $("sumtitle").textContent = W.ph === 2 ? "Out into the daylight" : "Lost in the mines";
    $("sumtext").textContent = W.ph === 2
      ? `You came up a shaft off Shaft Road after ${time} underground, and killed ${kills} on the way.`
      : `The party fell on level ${W.depth} (${this.L?.name}) after ${time}, having killed ${kills}.`;
    $("sumseed").textContent = `Mine seed ${seedText(W.seed)}: ${RUN_INFO[runTheme(W.seed)].name}.`;
    $("sumrelics").innerHTML = `<div class="invhead">You carried</div>` + this.invHtml();
    $("sumwait").textContent = W.ph === 2 ? "" : $("sumwait").textContent;
    $("again").hidden = W.ph !== 2;
  }

  again() { this.ask({ k: "again" }); }

  /** Each kind of run has its own light: the colour of the dark, and of the lamps. */
  private lampTint = "#ffa850";
  private look(run: RunTheme) {
    const L: Record<RunTheme, { fog: string; sky: string; ground: string; lamp: string }> = {
      flooded: { fog: "#020607", sky: "#8aa0a0", ground: "#4a5a58", lamp: "#ffc080" },
      burning: { fog: "#0a0301", sky: "#b08060", ground: "#704028", lamp: "#ff9040" },
      frozen: { fog: "#03060a", sky: "#a0b8d0", ground: "#506070", lamp: "#ffe0b0" },
      haunted: { fog: "#050308", sky: "#8a80a0", ground: "#504868", lamp: "#c0ffb0" },
      collapsed: { fog: "#080604", sky: "#a09078", ground: "#6a5a44", lamp: "#ffb060" },
    };
    const l = L[run];
    (this.scene.background as THREE.Color).set(l.fog);
    (this.scene.fog as THREE.Fog).color.set(l.fog);
    this.sky.color.set(l.sky);
    this.sky.groundColor.set(l.ground);
    this.lampTint = l.lamp;
  }

  sign(text: string) { $("where").textContent = text; this.signT = 5; }
  toast(text: string, secs = 2) {
    const el = $("toast");
    if (this.toastT <= 0 || el.textContent !== text) pop(el);   // a new call-out springs in (pop.ts)
    el.textContent = text;
    this.toastT = secs;
  }
  feed(html: string) {
    const el = document.createElement("div");
    el.innerHTML = html;
    $("feed").append(el);
    setTimeout(() => el.remove(), 6000);
    while ($("feed").children.length > 5) $("feed").firstElementChild!.remove();
  }

  dispose() {
    this.voice.dispose();
    this.net.leave();
  }
}

// for tests
export const _internals = { PACK, KINDS, DEPTHS };
