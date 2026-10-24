// Networking: a tiny message bus with two transports.
//
// - Trystero (WebRTC, peer to peer). Browsers find each other through public Nostr relays, then
//   talk directly. There is no game server and nothing to pay for.
//   The same links carry voice chat (see voice.ts). Every two seconds each link is checked (mend):
//   your mic is put back on any link that lost it or never agreed to carry it, and any voice coming
//   in is handed to voice.ts even if Trystero never passed it on. Joining in a crowd, two players
//   often added their mics at the same moment and one of them was lost on the way, so some players
//   could hear some of the others but not all; this puts that right within a few seconds.
// - BroadcastChannel, which links tabs in the same browser. Used for solo practice and for
//   testing multiplayer on one machine (add ?net=local to the URL). It can't carry audio.
import { getRelaySockets, joinRoom, selfId as trysteroId } from "trystero";
import type { Room, MessageAction } from "trystero";

export const MESSAGE_TYPES = ["hello", "st", "shot", "hit", "ev", "sb", "rs", "ch", "chit", "kt", "khit", "pick", "pk", "kick", "conv", "vin", "vout", "vs", "vh", "tf", "tfw", "tfx", "tfp", "vk", "bd", "bhit", "cn", "cnu", "trh",
  "mw", "mob", "mhit", "muse", "mev", "mhurt", "mfx", "call", "ver", "mk", "qe", "ow", "bv",
  "dk", "dg", "clk", "ldr", "lds", "gtr", "wd", "wdq", "bl", "scr", "pl", "so", "sd", "sg", "no", "bel"] as const;   // the m- ones are for the mines (mines/game.ts), the d- ones the deli (deli/game.ts)
export type MessageType = (typeof MESSAGE_TYPES)[number];
type Handler = (data: any, from: string) => void;

/** How a link to another player is doing, for the debug panel (debug.ts). Counts are running totals. */
export interface LinkStats {
  id: string;
  state: string;                                   // the browser's word for the link: connected, connecting, failed...
  route: "direct" | "relay" | "tab" | "?";         // straight between you, or through the TURN relay
  via: string;                                     // how: e.g. "udp, host/srflx"
  rtt: number | null;                              // the browser's round trip, ms
  ping: number | null;                             // a message there and back, ms
  jitter: number | null;                           // in their voice, ms
  lost: number | null; got: number | null;         // their voice packets lost and received
  bytesIn: number; bytesOut: number;
  micOut: boolean | null;                          // your mic is reaching them (null: you've no mic)
}

export interface Net {
  readonly selfId: string;
  readonly kind: "p2p" | "local";
  peers(): string[];
  send(type: MessageType, data: unknown, to?: string): void;
  on(type: MessageType, fn: Handler): void;
  onJoin: (id: string) => void;
  onLeave: (id: string) => void;
  onError: (msg: string) => void;
  /** Whether this transport carries audio. Only WebRTC rooms do, so voice chat needs one. */
  readonly media: boolean;
  /** Send a stream (the mic) to everyone, or to one player who just joined. */
  addStream(stream: MediaStream, to?: string): void;
  onStream: (stream: MediaStream, from: string) => void;
  leave(): void;
  /** For the debug panel: how each link is doing. */
  linkStats(): Promise<LinkStats[]>;
  /** For the debug panel: how many of the relays used to find other players are connected (WebRTC rooms only). */
  relays(): { up: number; all: number } | null;
  /** For the debug panel: when this page's game last changed, and when another player's did (undefined: they haven't said). */
  readonly build: number;
  buildOf(id: string): number | undefined;
}

const APP_ID = "combedowner-fps-v1";

// When the game on this page last changed (vite.config.ts). Players on different versions can still share a room, but the game
// changes several times a day and an old page misses fixes (voice chat among them), so whoever
// meets someone on a newer version is told to refresh, and they're told someone is behind. A new
// version going live mid-game says nothing: it only matters once someone on it joins your room.
declare const __BUILD__: number;
const BUILD = __BUILD__;
/** Another player's build against this page's: 1 newer, -1 older, 0 the same (within a minute), null not said yet. */
export function versusMine(build: number | undefined): -1 | 0 | 1 | null {
  if (build === undefined) return null;
  return build > BUILD + 60000 ? 1 : build < BUILD - 60000 ? -1 : 0;
}
/** Is a newer version of the game live than this page? Asks the site's version.json (written by
 *  every build, vite.config.ts), fresh. No answer (offline, the dev server, slow) counts as no. */
export async function newerLive(): Promise<boolean> {
  try {
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 3000);
    const r = await fetch(`version.json?v=${Date.now()}`, { cache: "no-store", signal: ctrl.signal });
    clearTimeout(t);
    const b = Number((await r.json())?.build);
    return r.ok && b > BUILD + 60000;
  } catch { return false; }
}
/** Did this page come from freshReload in the last couple of minutes? Then don't reload again for the
 *  same reason: if the site still hands out the old page, round and round it would go. */
export function justReloaded(): boolean {
  const v = Number(new URL(location.href).searchParams.get("v"));
  return v > 0 && Date.now() - v < 120000;
}
/** Load the page again, fresh: GitHub Pages lets a browser keep the page for ten minutes, so a plain
 *  reload can bring back the old version. A new query string fetches it anew. room: go straight back
 *  into it (main.ts presses Play once the menu's ready). */
export function freshReload(room?: string) {
  const url = new URL(location.href);
  url.searchParams.set("v", String(Date.now()));
  if (room) { url.searchParams.set("room", room); url.searchParams.set("join", "1"); }
  location.replace(url.toString());
}

// A TURN relay, for when two players' networks won't let them link up directly (mobile data, some
// work, school and hotel wi-fi). Without one, those players simply can't see each other. Set at
// build time: VITE_TURN_URLS (comma separated, e.g. "turn:host:80,turns:host:443?transport=tcp"),
// VITE_TURN_USERNAME and VITE_TURN_CREDENTIAL. The deploy workflow fills them from repo secrets.
// A browser refuses to make any link at all if one address is malformed, so mend the usual slip
// (a lost "?" before "transport=") and leave out anything that still doesn't look right.
const TURN_URLS = (import.meta.env.VITE_TURN_URLS ?? "").split(",")
  .map((u: string) => u.trim().replace(/(:\d+)(transport=)/, "$1?$2"))
  .filter((u: string) => /^turns?:[^\s:?]+(:\d+)?(\?transport=(udp|tcp))?$/.test(u));
const TURN = TURN_URLS.length
  ? [{ urls: TURN_URLS, username: import.meta.env.VITE_TURN_USERNAME, credential: import.meta.env.VITE_TURN_CREDENTIAL }]
  : undefined;

// The public Nostr relays players use to find each other in a room. Trystero's own pick for our app
// id was five little-known relays, and by October 2026 three of them were down: with only two
// left, a player whose network couldn't reach one of them never found some of the others, so they
// couldn't see or hear them. These were all checked to pass on a room announcement. The first two
// are the survivors of the old five, so pages from before this change still meet newer ones.
const RELAYS = [
  "relay02.lnfi.network", "nostr.islandarea.net",
  "nos.lol", "relay.damus.io", "relay.primal.net", "nostr.mom", "offchain.pub", "relay.nostr.net", "nostr.oxtr.dev",
].map((h) => `wss://${h}`);

class TrysteroNet implements Net {
  readonly selfId = trysteroId;
  readonly build = BUILD;
  readonly kind = "p2p" as const;
  readonly media = true;
  onJoin: (id: string) => void = () => {};
  onLeave: (id: string) => void = () => {};
  private room: Room;
  private actions = new Map<MessageType, MessageAction<any>>();
  private handlers = new Map<MessageType, Handler[]>();
  private present = new Set<string>();
  private met = new Set<string>();                    // everyone who's ever been linked in this room
  private closed = false;
  private toldOld = false;
  private toldBehind = false;
  // Everyone already in a room sends you their mic the moment you connect, which is before your game
  // (and its voice chat) has started. So keep each player's stream, and hand them all over once
  // something is listening.
  private streams = new Map<string, MediaStream>();
  private streamFn: (stream: MediaStream, from: string) => void = () => {};
  get onStream() { return this.streamFn; }
  set onStream(fn: (stream: MediaStream, from: string) => void) {
    this.streamFn = fn;
    for (const [id, stream] of this.streams) fn(stream, id);
  }
  private mic: MediaStream | null = null;            // your mic, which every link should carry
  private nudged = new Map<string, { at: number; tries: number; stuck: number }>();
  private mender = 0;

  // Joining, you meet the room (and swap versions) while still on the "Looking for…" screen,
  // before the game is there to show anything. So keep any warning until something is.
  private errors: string[] = [];
  private errorFn: ((msg: string) => void) | null = null;
  get onError() { return (msg: string) => { if (this.errorFn) this.errorFn(msg); else this.errors.push(msg); }; }
  set onError(fn: (msg: string) => void) {
    this.errorFn = fn;
    for (const msg of this.errors.splice(0)) fn(msg);
  }

  constructor(code: string) {
    this.room = joinRoom({ appId: APP_ID, turnConfig: TURN, relayConfig: { urls: RELAYS } }, code, {
      // Trystero tries several times and reports every failed try, even when a later one gets
      // through. So only say so if that player still isn't here after a few more seconds. And only
      // about someone who never got in: a player we've already been playing with is linking up
      // again after a hiccup (often just after a train ride, when they're in another town and we
      // can't see them anyway), and if they really have gone the game says they've left.
      onJoinError: (d) => {
        if (d.peerId && (this.present.has(d.peerId) || this.met.has(d.peerId))) return;
        setTimeout(() => {
          if (this.closed || (d.peerId && (this.present.has(d.peerId) || this.met.has(d.peerId)))) return;
          this.onError("Couldn't connect to a player. Their network may block direct connections.");
        }, 10000);
      },
    });
    for (const t of MESSAGE_TYPES) {
      const a = this.room.makeAction<any>(t);
      a.onMessage = (data, ctx) => this.handlers.get(t)?.forEach((fn) => fn(data, ctx.peerId));
      this.actions.set(t, a);
    }
    // Swap build times with everyone who arrives. Pages from before this check don't know "ver" and
    // never answer, so silence counts as an old page too.
    const versions = this.versions;
    this.actions.get("ver")!.onMessage = (d, ctx) => {
      if (typeof d !== "number") return;
      versions.set(ctx.peerId, d);
      if (d > BUILD + 60000) this.outdated("A player on a newer version of the game is here or trying to join. Refresh so you can play together.");
      else if (d < BUILD - 60000) this.behind();
    };
    this.room.onPeerJoin = (id) => {
      this.present.add(id);
      this.met.add(id);
      this.send("ver", BUILD, id);
      setTimeout(() => { if (!this.closed && this.present.has(id) && !versions.has(id)) this.behind(); }, 10000);
      this.onJoin(id);
    };
    this.room.onPeerLeave = (id) => { this.present.delete(id); this.versions.delete(id); this.streams.delete(id); this.nudged.delete(id); this.onLeave(id); };
    this.room.onPeerStream = (stream, id) => this.gotVoice(stream, id);
    this.mender = window.setInterval(() => this.mend(), 2000);
    // Closing the tab: say goodbye, so the others see you go at once rather than half a minute later.
    // Trystero does this when the page unloads, but phones and iPads often skip that and only tell the page it's hidden.
    addEventListener("pagehide", this.bye);
  }
  private bye = (e: PageTransitionEvent) => { if (!e.persisted) this.leave(); };
  private versions = new Map<string, number>();
  buildOf(id: string) { return this.versions.get(id); }

  private gotVoice(stream: MediaStream, id: string) {
    this.streams.set(id, stream);
    // play voice as it arrives instead of holding it back to smooth out the network (browsers without this setting ignore it)
    try {
      for (const r of this.room.getPeers()[id]?.getReceivers() ?? []) if (r.track.kind === "audio") (r as { jitterBufferTarget?: number | null }).jitterBufferTarget = 0;
    } catch { /* not supported */ }
    this.streamFn(stream, id);
  }

  /** Is this link carrying your mic, agreed by both ends? */
  private sending(pc: RTCPeerConnection, track: MediaStreamTrack) {
    const tr = pc.getTransceivers().find((t) => t.sender.track === track);
    return !tr ? null : tr.currentDirection === "sendrecv" || tr.currentDirection === "sendonly";
  }

  /** Every couple of seconds: make sure each link carries your mic, and that every voice coming in is being played. */
  private mend() {
    if (this.closed) return;
    const pcs = this.room.getPeers(), now = performance.now();
    const track = this.mic?.getAudioTracks().find((t) => t.readyState === "live");
    for (const id of this.present) {
      const pc = pcs[id];
      if (!pc || pc.connectionState !== "connected") continue;
      try {
        // sending: the mic was never put on this link (it was added while they were still joining)
        if (track) {
          const ok = this.sending(pc, track);
          const n = this.nudged.get(id) ?? this.nudged.set(id, { at: 0, tries: 0, stuck: 0 }).get(id)!;
          if (ok === null) {
            // through Trystero first, which tells older pages it's coming; if that didn't take, straight onto the link
            if (n.stuck++ === 0) this.addStream(this.mic!, id);
            else pc.addTrack(track, this.mic!);
          }
          else if (!ok && pc.signalingState === "stable") {
            // or it's on, but the two ends never agreed to send it (both changed the link at once and one change was dropped):
            // ask again, a few times, further apart each time
            if (++n.stuck >= 2 && n.tries < 6 && now - n.at > 4000 * 2 ** n.tries) {
              n.at = now; n.tries++; n.stuck = 0;
              pc.onnegotiationneeded?.(new Event("negotiationneeded"));
            }
          } else if (ok) n.stuck = 0;
        }
        // hearing: whatever voice is coming in on this link, play it, whether or not Trystero passed it on
        const incoming = pc.getTransceivers().filter((t) => t.receiver.track?.kind === "audio" && t.receiver.track.readyState === "live"
          && (t.currentDirection === "sendrecv" || t.currentDirection === "recvonly"));
        const pick = [...incoming].reverse().find((t) => !t.receiver.track.muted) ?? incoming[incoming.length - 1];
        const had = this.streams.get(id)?.getAudioTracks() ?? [];
        if (pick && !had.some((t) => t === pick.receiver.track && t.readyState === "live")) this.gotVoice(new MediaStream([pick.receiver.track]), id);
      } catch { /* the link is closing; try again next time */ }
    }
  }
  peers() { return [...this.present]; }
  send(type: MessageType, data: unknown, to?: string) {
    if (!this.present.size) return;
    this.actions.get(type)!.send(data as any, to ? { target: to } : undefined).catch(() => {});
  }
  on(type: MessageType, fn: Handler) { (this.handlers.get(type) ?? this.handlers.set(type, []).get(type)!).push(fn); }
  addStream(stream: MediaStream, to?: string) {
    if (!to) this.mic = stream;
    for (const p of this.room.addStream(stream, to ? { target: to } : undefined)) p.catch(() => {});
  }
  leave() {
    if (this.closed) return;
    this.closed = true; clearInterval(this.mender); removeEventListener("pagehide", this.bye); this.room.leave(); versionNotice(null);
  }
  relays() {
    const all = Object.values(getRelaySockets() ?? {}) as WebSocket[];
    return { up: all.filter((w) => w.readyState === WebSocket.OPEN).length, all: all.length };
  }
  async linkStats() {
    const pcs = this.room.getPeers();
    return Promise.all(this.peers().map(async (id): Promise<LinkStats> => {
      const pc = pcs[id];
      const track = this.mic?.getAudioTracks()[0];
      const s: LinkStats = { id, state: pc?.connectionState ?? "gone", route: "?", via: "", rtt: null, ping: null, jitter: null, lost: null, got: null, bytesIn: 0, bytesOut: 0,
        micOut: track && pc ? !!this.sending(pc, track) : null };
      const ping = Promise.race([
        this.room.ping(id).then((t) => { s.ping = t; }).catch(() => {}),
        new Promise((r) => setTimeout(r, 1500)),
      ]);
      if (pc) {
        try {
          const rep = await pc.getStats();
          const all = new Map<string, any>();
          rep.forEach((r: any) => all.set(r.id, r));
          // the pair of addresses the link is actually using
          let pair: any;
          for (const r of all.values()) if (r.type === "transport" && r.selectedCandidatePairId) pair = all.get(r.selectedCandidatePairId);
          for (const r of all.values()) if (!pair && r.type === "candidate-pair" && (r.selected || (r.nominated && r.state === "succeeded"))) pair = r;
          if (pair) {
            const lo = all.get(pair.localCandidateId), re = all.get(pair.remoteCandidateId);
            s.route = lo?.candidateType === "relay" || re?.candidateType === "relay" ? "relay" : "direct";
            s.via = `${lo?.relayProtocol ?? lo?.protocol ?? "?"}, ${lo?.candidateType ?? "?"}/${re?.candidateType ?? "?"}`;
            if (typeof pair.currentRoundTripTime === "number") s.rtt = pair.currentRoundTripTime * 1000;
            s.bytesIn = pair.bytesReceived ?? 0; s.bytesOut = pair.bytesSent ?? 0;
          }
          for (const r of all.values()) {
            if (r.type !== "inbound-rtp" || r.kind !== "audio") continue;
            s.lost = (s.lost ?? 0) + (r.packetsLost ?? 0);
            s.got = (s.got ?? 0) + (r.packetsReceived ?? 0);
            if (typeof r.jitter === "number") s.jitter = r.jitter * 1000;
          }
        } catch { /* no numbers this time */ }
      }
      await ping;
      return s;
    }));
  }
  private outdated(msg: string) {
    if (this.toldOld || this.closed) return;
    this.toldOld = true;
    versionNotice(msg, true);
  }
  private behind() {
    if (this.toldBehind || this.toldOld || this.closed) return;
    this.toldBehind = true;
    versionNotice("A player on an older version of the game is here or trying to join. Ask them to refresh so you can play together.");
  }
}

// Version warnings get a banner of their own at the top of the screen rather than a toast, so
// "Mic on" and the like can't wipe them, and it's big and bright: players on two versions see some
// things differently (a car on one is a bus on the other, and worse), so it mustn't be missed. It
// stays until it's tapped: on a newer version that refreshes the page, otherwise it just goes away.
// null takes it down.
function versionNotice(text: string | null, refresh = false) {
  document.getElementById("vnotice")?.remove();
  if (!text) return;
  const el = document.createElement("div");
  el.id = "vnotice";
  el.textContent = `${text} ${refresh ? "(tap to refresh)" : "(tap to hide)"}`;
  el.style.cssText = "position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:1000;max-width:min(92vw,640px);"
    + "padding:10px 16px;font:bold 16px/1.35 system-ui,sans-serif;cursor:pointer;text-align:center;border-radius:8px;"
    + "box-shadow:0 2px 12px rgba(0,0,0,.5);border:2px solid #fff;"
    + (refresh ? "color:#1a1200;background:#ffb020" : "color:#fff;background:#c0392b");
  el.onclick = () => (refresh ? freshReload() : el.remove());
  document.body.append(el);
}

class LocalNet implements Net {
  readonly selfId = Math.random().toString(36).slice(2, 12);
  readonly build = BUILD;
  // tabs say their version with every ping, so two builds served side by side (at two paths of one
  // site, for testing) find each other out the same way as over WebRTC
  private versions = new Map<string, number>();
  buildOf(id: string) { return this.versions.get(id); }
  readonly kind = "local" as const;
  readonly media = false;
  onJoin: (id: string) => void = () => {};
  onLeave: (id: string) => void = () => {};
  onError: (msg: string) => void = () => {};
  onStream: (stream: MediaStream, from: string) => void = () => {};
  private ch: BroadcastChannel;
  private handlers = new Map<string, Handler[]>();
  private seen = new Map<string, number>();
  private timer: number;
  private closed = false;

  constructor(code: string) {
    this.ch = new BroadcastChannel(`${APP_ID}:${code}`);
    this.ch.onmessage = (e) => {
      const { t, d, from, to } = e.data;
      if (from === this.selfId || (to && to !== this.selfId)) return;
      if (t === "_bye") { this.versions.delete(from); if (this.seen.delete(from)) this.onLeave(from); return; }
      const isNew = !this.seen.has(from);
      this.seen.set(from, performance.now());
      if (t === "_ping" && typeof d === "number" && !this.versions.has(from)) {
        this.versions.set(from, d);
        const v = versusMine(d);
        if (v) versionNotice(v > 0 ? "A player on a newer version of the game is here or trying to join. Refresh so you can play together."
          : "A player on an older version of the game is here or trying to join. Ask them to refresh so you can play together.", v > 0);
      }
      if (isNew) { this.post("_ping", BUILD, from); this.onJoin(from); }
      if (t[0] !== "_") this.handlers.get(t)?.forEach((fn) => fn(d, from));
    };
    this.post("_ping", BUILD);
    this.timer = window.setInterval(() => {
      this.post("_ping", BUILD);
      const now = performance.now();
      for (const [id, at] of this.seen) if (now - at > 4000) { this.seen.delete(id); this.onLeave(id); }
    }, 1000);
    addEventListener("pagehide", () => this.post("_bye", null));
  }
  private post(t: string, d: unknown, to?: string) { if (!this.closed) this.ch.postMessage({ t, d, from: this.selfId, to }); }
  peers() { return [...this.seen.keys()]; }
  send(type: MessageType, data: unknown, to?: string) { this.post(type, data, to); }
  addStream() {}
  on(type: MessageType, fn: Handler) { (this.handlers.get(type) ?? this.handlers.set(type, []).get(type)!).push(fn); }
  leave() { this.post("_bye", null); this.closed = true; clearInterval(this.timer); this.ch.close(); }
  relays() { return null; }
  async linkStats() {
    return this.peers().map((id): LinkStats => ({ id, state: "connected", route: "tab", via: "", rtt: null, ping: null, jitter: null, lost: null, got: null, bytesIn: 0, bytesOut: 0, micOut: null }));
  }
}

export function connect(code: string, local: boolean): Net {
  return local ? new LocalNet(code) : new TrysteroNet(code);
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newRoomCode(): string {
  const a = new Uint32Array(5);
  crypto.getRandomValues(a);
  return [...a].map((v) => CODE_CHARS[v % CODE_CHARS.length]).join("");
}
/** Room codes and names: letters and digits only, any case, so they're easy to read out to a friend. */
export function cleanCode(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
}
