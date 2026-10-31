// Procedural soundtrack: chugging metal in the spirit of 90s shooter scores, played on
// 16-bit console instruments (FM synthesis like the Mega Drive's sound chip, and lo-fi drum
// samples) and synthesised with Web Audio so the game still ships no sound files. The tracks are
// written out in src/tracks; within a track the arrangement picks the order of the riffs, their
// key and the lead parts at random, so the music plays forever without looping exactly.

import { TRACKS } from "./tracks";
import type { Riff, Track } from "./tracks/notation";

const E2 = 40;               // MIDI number of the low E string

// Fills for the last bar of a phrase (the second half of the bar): k kick, s snare, h/m/l toms.
const FILLS = ["k...s.k.sshhmmll", "k...s...ssssssss", "k.s.k.s.hhmmllss", "k...s.ksk.hhk.ll"];
const FILLS12 = ["k..s..sshhml", "k..s..ssssss", "k.sk.shhmmll", "k..s..k.shml"];

// FM settings for each tone choice: modulator ratio, then the index it starts at, settles to and how fast
const LEADS = {
  brass:  { ratio: 1, i0: 6, i1: 3, it: 0.1 },
  hollow: { ratio: 2, i0: 3, i1: 1.6, it: 0.1 },
  bell:   { ratio: 3.5, i0: 4, i1: 0.6, it: 0.3 },
  reed:   { ratio: 3, i0: 2.5, i1: 1.8, it: 0.1 },
};
const BASSES = {
  slap: { i0: 5, i1: 1.1, it: 0.04 },
  pick: { i0: 3, i1: 2, it: 0.1 },
  sub:  { i0: 1.2, i1: 0.4, it: 0.05 },
};

type Bar = {
  track: Track; name: string; riff: Riff; i: number; key: number;
  lead: boolean; drums: boolean; fill: boolean; crash: boolean; first?: boolean;
};

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** Unhook a note's nodes once its sound has stopped, so the graph doesn't keep processing them. */
function release(src: AudioScheduledSourceNode, ...nodes: AudioNode[]) {
  src.onended = () => { for (const n of nodes) n.disconnect(); };
}

/** Render a drum hit to a short 8-bit, 22 kHz sample, the way 16-bit consoles stored their drums. */
function drumSample(ctx: BaseAudioContext, len: number, rand: () => number, f: (t: number, noise: number) => number) {
  const sr = 22050;
  const b = ctx.createBuffer(1, Math.floor(len * sr), sr);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.round(Math.max(-1, Math.min(1, f(i / sr, rand() * 2 - 1))) * 127) / 127;
  return b;
}

/**
 * When a riff moves up by `key`, move its lead up by the same amount or by that minus an octave,
 * whichever keeps the whole lead nearest its written register (b4 to g6).
 */
function leadShift(riff: Riff, key: number) {
  if (!key || !riff.lead) return key;
  const notes = riff.lead.flat().map((n) => n.midi);
  const outside = (s: number) => notes.filter((m) => m + s < 59 || m + s > 91).length;
  return outside(key - 12) < outside(key) || (outside(key - 12) === outside(key) && key > 4) ? key - 12 : key;
}

export type BarInfo = { track: string; name: string; i: number; key: number; lead: boolean; drums: boolean };
export const TRACK_NAMES = TRACKS.map((t) => t.name);
/** A track found in the game (a tape, golfdriver.ts) goes on the playlist for good. */
export function addToPlaylist(t: Track) {
  if (TRACKS.includes(t)) return;
  TRACKS.push(t);
  TRACK_NAMES.push(t.name);
}
/** A track's name as shown to players: "Artist - Name" for covers. */
export function trackTitle(name: string) {
  const t = TRACKS.find((t) => t.name === name);
  return t?.artist ? `${t.artist} - ${name}` : name;
}

export type SoundtrackOptions = {
  /** Track to start with (by name, or a track that isn't in the playlist); a random one if not given. */
  track?: string | Track;
  /** Move on to another track after about this many seconds (0 = never). Default 150. */
  changeAfter?: number;
  /** Random seed, so a render is repeatable. */
  seed?: number;
};

/** Endless procedural 16-bit metal. Call scheduleUntil(t) often enough to stay ahead of playback. */
export class Soundtrack {
  private ctx: BaseAudioContext;
  private bus: GainNode;
  private gtr: AudioNode[] = [];
  private bass: AudioNode;
  private leadIn: AudioNode;
  private echo: DelayNode;
  private echoOut: GainNode;
  private drums: AudioNode;
  private kit: Record<"kick" | "snare" | "hat" | "openHat" | "crash" | "tom", AudioBuffer>;
  private next = 0;          // start time of the next bar to schedule
  private queue: Bar[] = [];
  private track: Track;
  private switchTo: Track | null;
  private trackTime = 0;     // seconds of the current track scheduled so far
  private changeAfter: number;
  private last = "";
  private seed: number;
  /** Called as each bar is scheduled, with the time it will start playing. */
  onBar?: (bar: BarInfo, time: number) => void;
  /** Called when a new track is scheduled, with the time it will start playing. */
  onTrack?: (name: string, time: number) => void;

  constructor(ctx: BaseAudioContext, out: AudioNode, opts: SoundtrackOptions = {}) {
    this.ctx = ctx;
    this.seed = opts.seed ?? (Math.random() * 2 ** 32) >>> 0;
    this.changeAfter = opts.changeAfter ?? 150;
    this.track = typeof opts.track === "object" ? opts.track
      : TRACKS.find((t) => t.name === opts.track) ?? TRACKS[Math.floor(this.rand() * TRACKS.length)];
    this.switchTo = this.track;
    // a 9-bit output stage, like the Mega Drive's FM chip, for a little grit
    const crush = ctx.createWaveShaper();
    const c = new Float32Array(4097);
    for (let i = 0; i < c.length; i++) c[i] = Math.round((i / 2048 - 1) * 256) / 256;
    crush.curve = c;
    crush.connect(out);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.002; comp.release.value = 0.15;
    comp.connect(crush);
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.3;
    this.bus.connect(comp);

    const rand = () => this.rand();
    const hp = () => { let p = 0; return (n: number) => { const y = n - p; p = n; return y; }; };
    const snareHp = hp(), hatHp = hp(), openHp = hp(), crashHp = hp();
    let kickPh = 0, tomPh = 0;
    this.kit = {
      kick: drumSample(ctx, 0.4, rand, (t, n) => {
        kickPh += (2 * Math.PI * (48 + 130 * Math.exp(-t / 0.025))) / 22050;
        return Math.tanh(1.8 * Math.sin(kickPh)) * Math.exp(-t / 0.2) + (t < 0.004 ? n * 0.5 : 0);
      }),
      snare: drumSample(ctx, 0.3, rand, (t, n) =>
        0.75 * snareHp(n) * Math.exp(-t / 0.08) + 0.5 * Math.sin(2 * Math.PI * 185 * t) * Math.exp(-t / 0.05)),
      hat: drumSample(ctx, 0.08, rand, (t, n) => 0.6 * hatHp(n) * Math.exp(-t / 0.018)),
      openHat: drumSample(ctx, 0.35, rand, (t, n) => 0.5 * openHp(n) * Math.exp(-t / 0.11)),
      crash: drumSample(ctx, 1.8, rand, (t, n) => 0.45 * crashHp(n) * Math.exp(-t / 0.5)),
      tom: drumSample(ctx, 0.5, rand, (t) => {
        tomPh += (2 * Math.PI * 100 * (1 + 0.5 * Math.exp(-t / 0.04))) / 22050;
        return Math.sin(tomPh) * Math.exp(-t / 0.2);
      }),
    };

    // two FM guitars, double-tracked and panned apart, through a crunchy overdrive
    const drive = new Float32Array(2048);
    for (let i = 0; i < drive.length; i++) drive[i] = Math.tanh(2.5 * (i / 1023.5 - 1));
    for (const pan of [-0.6, 0.6]) {
      const pre = ctx.createGain();
      pre.gain.value = 0.6;
      const amp = ctx.createWaveShaper();
      amp.curve = drive;
      amp.oversample = "2x";
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      const g = ctx.createGain();
      g.gain.value = 0.48;
      pre.connect(amp).connect(this.filter("highpass", 90, 0.7)).connect(this.filter("lowpass", 9000, 0.7))
        .connect(p).connect(g).connect(this.bus);
      this.gtr.push(pre);
    }

    const bass = ctx.createGain();
    bass.gain.value = 0.3;
    bass.connect(this.bus);
    this.bass = bass;

    // FM lead with some bite, and the dotted-eighth echo the old soundtracks loved
    const lead = ctx.createGain();
    lead.gain.value = 0.6;
    const lamp = ctx.createWaveShaper();
    lamp.curve = drive;
    const lg = ctx.createGain();
    lg.gain.value = 0.24;
    lead.connect(lamp).connect(lg).connect(this.bus);
    this.echo = ctx.createDelay(1.5);
    const fb = ctx.createGain();
    fb.gain.value = 0.3;
    this.echoOut = ctx.createGain();
    this.echoOut.gain.value = 0.4;
    lg.connect(this.echo).connect(fb).connect(this.echo);
    this.echo.connect(this.echoOut).connect(this.bus);
    this.leadIn = lead;

    const drums = ctx.createGain();
    drums.gain.value = 0.48;
    drums.connect(this.bus);
    this.drums = drums;
  }

  /** Schedule every bar that starts before time t. */
  scheduleUntil(t: number) {
    const now = this.ctx.currentTime;
    // the scheduler fell behind (a stalled tab): pick up again from now
    if (this.next < now) this.next = now + 0.05;
    while (this.next < t) {
      if (!this.queue.length) this.arrange();
      const bar = this.queue.shift()!;
      if (bar.first) {
        // a track is starting
        this.track = bar.track;
        this.trackTime = 0;
        this.echo.delayTime.setValueAtTime((60 / bar.track.bpm) * 0.75, this.next);
        // songs keep the echo low, so its off-beat repeats don't blur the groove
        this.echoOut.gain.setValueAtTime(bar.track.form ? 0.12 : 0.4, this.next);
        this.onTrack?.(bar.track.name, this.next);
      }
      this.playBar(bar, this.next);
      this.onBar?.({ track: bar.track.name, name: bar.name, i: bar.i, key: bar.key, lead: bar.lead, drums: bar.drums }, this.next);
      const len = 240 / bar.track.bpm;
      this.next += len;
      this.trackTime += len;
    }
  }

  /** Drop the rest of the current section and move on, to the named riff of this track if given. */
  skip(name?: string) {
    this.queue = [];
    this.arrange(name);
  }

  /** Move on to another track (the named one, or a random one) as soon as possible. */
  nextTrack(name?: string) {
    this.queue = [];
    this.switchTo = TRACKS.find((t) => t.name === name) ?? this.otherTrack();
  }

  // --- arrangement ---------------------------------------------------------

  private rand() {
    // mulberry32, so a preview render is repeatable from its seed
    let x = (this.seed = (this.seed + 0x6d2b79f5) >>> 0);
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 2 ** 32;
  }

  private otherTrack(than = this.track) {
    const others = TRACKS.filter((t) => t !== than);
    return others.length ? others[Math.floor(this.rand() * others.length)] : than;
  }

  private phrase(track: Track, name: string, o: Partial<Bar>) {
    const bars = track.riffs[name].guitar.length;
    for (let i = 0; i < bars; i++) {
      this.queue.push({
        track, name, riff: track.riffs[name], i, key: o.key ?? 0, lead: !!o.lead, drums: o.drums ?? true,
        fill: i === bars - 1 && !!o.fill, crash: i === 0 && (o.crash ?? true), first: i === 0 && o.first,
      });
    }
  }

  private arrange(pick?: string) {
    // with only one track there's nothing to change to, so just keep playing it
    if (!this.switchTo && this.changeAfter > 0 && this.trackTime >= this.changeAfter && TRACKS.length > 1) this.switchTo = this.otherTrack();
    const next = this.switchTo;
    if (next?.form) {
      // a song: play it through once, as written, then move on
      this.switchTo = this.otherTrack(next);
      // a crash where each section starts and a drum fill into it
      const form = next.form.map((f) => f.replace(/^~/, ""));
      form.forEach((name, i) => this.phrase(next, name, {
        lead: !next.form![i].startsWith("~"), first: i === 0,
        crash: i > 0 && form[i - 1] !== name, fill: i + 1 < form.length && form[i + 1] !== name,
      }));
      return;
    }
    if (next) {
      // open with the track's signature riff alone, then the band comes in
      this.switchTo = null;
      this.last = next.intro;
      this.phrase(next, next.intro, { drums: false, crash: false, fill: true, first: true });
      this.phrase(next, next.intro, { fill: true });
      return;
    }
    const track = this.queue.length ? this.queue[this.queue.length - 1].track : this.track;
    const riffs = track.riffs;
    const names = Object.keys(riffs).filter((n) => n !== this.last);
    let r = this.rand() * names.reduce((s, n) => s + riffs[n].weight, 0);
    let name = names[0];
    for (const n of names) { r -= riffs[n].weight; if (r < 0) { name = n; break; } }
    if (pick && pick in riffs) name = pick;
    this.last = name;
    const riff = riffs[name];
    // move a riff up now and then, the way old shooter tracks do
    const key = riff.shift && this.rand() < 0.3 ? riff.shift : 0;
    this.phrase(track, name, { key, fill: this.rand() < 0.5 });
    this.phrase(track, name, { key, lead: !!riff.lead, fill: true });
  }

  private playBar(bar: Bar, t0: number) {
    const { riff, key, track } = bar;
    const step = 240 / track.bpm / riff.len;
    const beat = riff.len / 4;
    const root = E2 + track.key + key;
    for (const h of riff.guitar[bar.i]) {
      const t = t0 + h.step * step;
      this.chord(t, h.len * step, step, root + h.off, h.mute, track.tone.bright);
      if (!riff.bass) this.bassNote(t, h.len * step, step, root - 12 + h.off, h.mute, track.tone.bass);
    }
    for (const h of riff.bass?.[bar.i] ?? []) {
      this.bassNote(t0 + h.step * step, h.len * step, step, root - 12 + h.off, false, track.tone.bass);
    }
    if (bar.lead && riff.lead) {
      const shift = leadShift(riff, key);
      for (const n of riff.lead[bar.i]) this.leadNote(t0 + n.step * step, n.len * step, step, n.midi + shift, track.tone.lead);
    }
    if (bar.crash) this.crash(t0);
    if (!bar.drums) {
      if (bar.fill) for (let i = riff.len / 2; i < riff.len; i++) this.snare(t0 + i * step, 0.25 + i / (riff.len * 1.5));
      return;
    }
    const groove = riff.drums[bar.i % riff.drums.length];
    const fills = riff.len === 12 ? FILLS12 : FILLS;
    const fill = bar.fill ? fills[Math.floor(this.rand() * fills.length)] : "";
    const toms: Record<string, number> = { h: 190, m: 140, l: 100 };
    for (let i = 0; i < riff.len; i++) {
      const t = t0 + i * step;
      const accent = i % beat === 0 ? 1 : 0.75;
      // songs fill with a plain snare roll on the last beat, so the groove never trips
      if (bar.fill && track.form && i >= riff.len - beat) {
        this.snare(t, 0.5 + 0.5 * (i - (riff.len - beat)) / beat);
        if (i === riff.len - beat) this.kick(t, 1);
        continue;
      }
      if (fill && !track.form && i >= riff.len / 2) {
        const c = fill[i];
        if (c === "k") this.kick(t, 1);
        else if (c === "s") this.snare(t, 0.6 + (i - riff.len / 2) / riff.len);
        else if (c in toms) this.tom(t, toms[c]);
        continue;
      }
      if (groove.k[i] === "x") this.kick(t, accent);
      if (groove.s[i] === "x") this.snare(t, i % beat === 0 ? 1 : 0.55);
      if (groove.h[i] === "c") this.crash(t);
      else if (groove.h[i] !== "." && !(bar.crash && i === 0)) this.hat(t, groove.h[i] === "o", accent);
    }
  }

  // --- instruments ---------------------------------------------------------

  private filter(type: BiquadFilterType, freq: number, q: number) {
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    return f;
  }

  /**
   * A two-operator FM voice: a modulator bends the carrier's pitch at audio rate, and the
   * modulation index (from idx0 falling towards idx1) sets how bright and buzzy it sounds.
   */
  private fm(t: number, end: number, f: number, out: AudioNode, idx0: number, idx1: number, idxTime: number,
    sus: number, susTime: number, ratio = 1) {
    const ctx = this.ctx;
    const car = ctx.createOscillator();
    car.frequency.value = f;
    const mod = ctx.createOscillator();
    mod.frequency.value = f * ratio;
    const dev = ctx.createGain();
    dev.gain.setValueAtTime(idx0 * f * ratio, t);
    dev.gain.setTargetAtTime(idx1 * f * ratio, t, idxTime);
    mod.connect(dev).connect(car.frequency);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(1, t + 0.003);
    env.gain.setTargetAtTime(sus, t + 0.003, susTime);
    env.gain.setTargetAtTime(0, end, 0.015);
    car.connect(env).connect(out);
    car.start(t); mod.start(t);
    car.stop(end + 0.1); mod.stop(end + 0.1);
    release(car, env, dev);
    return { car, mod, dev };
  }

  private chord(t: number, dur: number, step: number, root: number, mute: boolean, bright: number) {
    const notes = mute ? [root, root + 7] : [root, root + 7, root + 12];
    const ring = mute ? Math.min(dur, step * 1.5) : dur;
    for (const side of this.gtr) {
      const start = t + this.rand() * 0.006;   // two players are never quite together
      const detune = 2 ** ((this.rand() - 0.5) * 0.06 / 12);
      for (const n of notes) {
        if (mute) this.fm(start, start + ring, hz(n) * detune, side, 2.6 * bright, 1.2 * bright, 0.03, 0.3, 0.04);
        else this.fm(start, start + ring, hz(n) * detune, side, 6 * bright, 3.4 * bright, 0.12, 0.8, 0.4);
      }
    }
  }

  private bassNote(t: number, dur: number, step: number, midi: number, mute: boolean, tone: keyof typeof BASSES) {
    const ring = mute ? Math.min(dur, step * 1.3) : dur;
    const b = BASSES[tone];
    this.fm(t, t + ring, hz(midi), this.bass, b.i0, b.i1, b.it, 0.7, 0.2);
  }

  private leadNote(t: number, dur: number, step: number, midi: number, tone: keyof typeof LEADS) {
    const ctx = this.ctx;
    const f = hz(midi);
    const end = t + dur - 0.01;
    const p = LEADS[tone];
    const { car, mod } = this.fm(t, end, f, this.leadIn, p.i0, p.i1, p.it, 0.8, 0.3, p.ratio);
    if (dur > step * 3) {
      // long notes bend up into pitch, then get vibrato
      car.frequency.setValueAtTime(f * 0.944, t);
      car.frequency.exponentialRampToValueAtTime(f, t + 0.06);
      mod.frequency.setValueAtTime(f * p.ratio * 0.944, t);
      mod.frequency.exponentialRampToValueAtTime(f * p.ratio, t + 0.06);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 6;
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.setValueAtTime(0, t + 0.2);
      depth.gain.linearRampToValueAtTime(f * 0.02, t + 0.4);
      lfo.connect(depth).connect(car.frequency);
      lfo.start(t); lfo.stop(end + 0.1);
      release(lfo, depth);
    }
  }

  private hit(buf: AudioBuffer, t: number, vol: number, rate = 1) {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.drums);
    src.start(t);
    release(src, g);
  }

  private kick(t: number, vol: number) { this.hit(this.kit.kick, t, vol); }
  private snare(t: number, vol: number) { this.hit(this.kit.snare, t, vol); }
  private hat(t: number, open: boolean, vol: number) { this.hit(open ? this.kit.openHat : this.kit.hat, t, 0.5 * vol); }
  private crash(t: number) { this.hit(this.kit.crash, t, 0.7); }
  private tom(t: number, f: number) { this.hit(this.kit.tom, t, 0.9, f / 100); }
}
