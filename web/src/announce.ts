// Station announcements: the automated voice you hear on Great Western Railway platforms, read out
// by the browser's own speech in a British woman's voice. Near a station you hear "Platform two for
// the fourteen twenty Great Western Railway service to Westbury", calling at its stations, and
// "The train now approaching platform two is..." as it comes in, with the odd "See it. Say it.
// Sorted." between trains. No chime first: GWR don't use one. A train you can't get on is only
// said to be approaching, not in service. On a map whose trains aren't Great Western's (OPERATORS)
// it's just "the fourteen twenty service", without the British Transport Police.
//
// Each announcement is said in short phrases, one after another, the way the real ones are stitched
// together from recorded pieces, which gives them that stop-start rhythm. The browser's speech
// can't be run through the game's sound (there's no way to filter or echo it), so the phrasing,
// the voice and its pace are what make it sound like a station.
//
// Who decides what: nobody. The times come from the trains' timetable (railway.ts), which runs to
// the clock, so everyone at the same station hears the same announcement at the same moment, and
// nothing goes over the network. The times said are the game's clock (daylight.ts), as on the boards.
import * as SFX from "./audio";
import { clockAt } from "./daylight";
import type { Departure, Railway } from "./railway";

const synth = typeof speechSynthesis !== "undefined" ? speechSynthesis : null;

const RANGE = 90;          // metres from a platform you can hear the station's speakers
const NEXT = 80;           // seconds before a train pulls in that it's announced
const APPROACH = 18;       // and that it's said to be approaching
const LATE = 8;            // an announcement more than this late is dropped rather than said
const FILLER = [150, 260]; // seconds between the announcements that aren't about a train

/** Who runs the trains on each map, for the announcements; elsewhere it's just "the service". */
const OPERATORS: Record<string, string> = { "combe-down": "Great Western Railway", "bradford-on-avon": "Great Western Railway" };

const FILLERS = [
  ["If you see something that doesn't look right,", "speak to staff,", "or text the British Transport Police", "on six one, oh one six.", "We'll sort it.", "See it.", "Say it.", "Sorted."],
  ["Please keep your personal belongings with you", "at all times."],
  ["This is a no smoking station.", "Smoking, including e-cigarettes,", "is not permitted anywhere on this station."],
  ["Customers are reminded", "that cycling, skateboarding and pogo sticks", "are not permitted on the platforms."],
  ["Please take care when using the stairs.", "Use the handrail,", "and do not run on the platforms."],
];

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven",
  "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty"];
const words = (n: number) => n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : "");

/** A platform's number as said: "two", or as written if it isn't a plain number ("2a"). */
const platform = (no: string) => /^\d{1,2}$/.test(no) && Number(no) < 60 ? words(Number(no)) : no;

/** A time as a station says it: "the fourteen twenty", "the nine oh five", "the sixteen hundred". */
function spoken(t: number): string {
  const [h, m] = clockAt(t).split(":").map(Number);
  const hh = h ? words(h) : "zero zero";
  return `the ${hh} ${m === 0 ? (h < 10 ? "o'clock" : "hundred") : m < 10 ? `oh ${ONES[m]}` : words(m)}`;
}

/** "Freshford, Avoncliff and Westbury", as phrases. */
function callingAt(calls: string[]): string[] {
  if (!calls.length) return [];
  if (calls.length === 1) return [`Calling at ${calls[0]} only.`];
  return ["Calling at", ...calls.slice(0, -1).map((c) => `${c},`), `and ${calls[calls.length - 1]}.`];
}

const FEMALE = /female|serena|kate|stephanie|martha|hazel|libby|sonia|maisie|susan|amy|emma|bella|abbi|hollie|olivia/i;
let voice: SpeechSynthesisVoice | null = null;
/** The station voice: a British woman's if there is one, else any British voice, else any English one. */
function load() {
  const all = synth?.getVoices() ?? [];
  const lang = (v: SpeechSynthesisVoice) => v.lang.replace("_", "-").toLowerCase();
  const gb = all.filter((v) => lang(v) === "en-gb");
  voice = gb.find((v) => FEMALE.test(v.name) && !/\bmale/i.test(v.name.replace(/female/i, "")))
    ?? gb[0] ?? all.find((v) => lang(v).startsWith("en")) ?? null;
}
if (synth) {
  load();
  synth.addEventListener?.("voiceschanged", load);
}

export class Announcer {
  /** The announcements already made (or let go), by train and kind, so each is made once. */
  private said = new Set<string>();
  private fillerAt = 0;
  private t = 0;

  /** Each frame: if you're near a station, announce what's due there. */
  update(dt: number, rail: Railway | null | undefined, x: number, z: number, mapId = "", now = Date.now() / 1000) {
    this.t -= dt;
    if (this.t > 0 || !rail || !synth) return;
    this.t = 0.5;
    const near = rail.stationNear(x, z, RANGE);
    if (!near) { this.fillerAt = 0; return; }
    const loud = Math.min(1, 1.15 - near.far / RANGE) * SFX.effectsVolume();
    if (!this.fillerAt) this.fillerAt = now + 20 + Math.random() * 40;
    const op = OPERATORS[mapId] ? `${OPERATORS[mapId]} ` : "";
    for (const d of rail.departures(near.station, 6)) {
      if (!d.service) {
        this.at(d, "app", d.arrive - APPROACH, now, loud, () => [
          d.plat ? `The train now approaching platform ${platform(d.plat)}` : "The train now approaching",
          "is not in service.", "Please do not board this train.", "Please stand behind the yellow line.",
        ]);
        continue;
      }
      this.at(d, "next", d.arrive - NEXT, now, loud, () => [
        d.plat ? `Platform ${platform(d.plat)},` : "",
        `for ${spoken(d.at)}`, `${op}service`, `to ${d.to}.`,
        ...callingAt(d.calls),
        `This train is formed of ${words(d.coaches)} coaches.`,
      ]);
      this.at(d, "app", d.arrive - APPROACH, now, loud, () => [
        d.plat ? `The train now approaching platform ${platform(d.plat)}` : "The train now approaching",
        `is ${spoken(d.at)}`, `${op}service`, `to ${d.to}.`,
        "Please stand behind the yellow line.",
      ]);
    }
    if (now >= this.fillerAt) {
      this.fillerAt = now + FILLER[0] + Math.random() * (FILLER[1] - FILLER[0]);
      // never over a train's announcement
      const fillers = op ? FILLERS : FILLERS.slice(1);
      if (!synth.speaking && !synth.pending) this.say(fillers[Math.floor(Math.random() * fillers.length)], loud);
    }
    if (this.said.size > 200) this.said.clear();
  }

  /** Make one announcement about a train when its moment comes, once; one missed by more than a
   *  few seconds (you only just got here) is let go. */
  private at(d: Departure, kind: string, when: number, now: number, loud: number, lines: () => string[]) {
    const key = `${d.arrive}|${d.plat}|${d.to}|${kind}`;
    if (now < when || this.said.has(key)) return;
    this.said.add(key);
    if (now - when < LATE) this.say(lines(), loud);
  }

  private say(lines: string[], loud: number) {
    if (!synth || document.hidden || loud <= 0.05) return;
    for (const text of lines) {
      if (!text) continue;
      const u = new SpeechSynthesisUtterance(text);
      if (voice) u.voice = voice;
      u.lang = voice?.lang ?? "en-GB";
      u.rate = 0.9;
      u.pitch = 0.95;
      u.volume = loud;
      synth.speak(u);
    }
  }
}
