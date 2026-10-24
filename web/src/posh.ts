// The rugby and cricket teams (and the Flag Lads, and the naughty girls on a night out) don't just shout
// "Oi!": they speak in actual words, using the browser's own speech voice. We pick a British one if the
// browser has one (a man's voice if we can find one, or a woman's for the girls) so they sound right. Their line also shows in a bubble over their head (see
// naughtyboys.ts), so you still get it with the sound off or with no speech voice at all. When they've
// had enough and leg it, everyone shouts something on the way (naughty boys included).
import * as SFX from "./audio";

/** Any of the posh lot might say these. The ones asked for come up twice as often. */
const ANYONE = [
  "Come on then!", "Come on then!", "I used to box for Cambridge, you know.", "I used to box for Cambridge, you know.",
  "I'm a master pugilist.", "I'm a master pugilist.", "Put your fists up, sir!", "Queensberry rules, old boy!",
  "I say! You there!", "Have at you!", "Right, you frightful oik.", "Do you know who my father is?",
  "Tally ho!", "Come here, you absolute cad!", "I'll give you a jolly good thrashing!", "Fisticuffs it is, then!",
  "Rah!", "Steady on, I'm a Blue!",
];
const RUGBY = [
  "Scrum down, chaps!", "Let's ruck him, lads!", "Hand off! Hand off!", "First fifteen, with me!",
  "I'll put you in touch, sunshine!", "Ruck over!", "Tackle him, Tarquin!",
];
const CRICKET = [
  "Howzat!", "I'll hit you for six!", "Leg before wicket, old boy!", "That's not cricket!",
  "Stumps for you, sunshine!", "Owzat, umpire?", "Fetch my pads, Rupert!",
];

/** The Flag Lads (invasion.ts): the lamp post crusade, and the odd slip about what's behind it. Kind 3
 *  is a lad, 5 the Gaffer. The joke's on them: they never get further than "I'm not being funny, but". */
const SOCIETY = [
  "Every lamp post needs a flag!", "It's not a protest, it's decorating!", "Mind the ladder, I'm being proud!",
  "Proud of what? Er... the flag!", "Who left this lamp post naked?", "Get off our street! I'm from Swindon, mind.",
  "St George was from Turkey? Shut up!", "Colours up, lads!", "I've got four hundred cable ties!",
  "Flag first, then a curry!", "I'm not being funny, but...", "We're taking it back! Back where? Dunno!",
  "That roundabout wants painting!", "Respect the flag! Not you, the flag!",
];
const CHAIR = [
  "This lamp post is now British!", "Nobody touches my flags!", "Rule Britannia! How's the next bit go?",
  "Lads! More cable ties!", "It's heritage, innit!",
  "I'm not being funny, but...", "St George never even came here? Lies!",
];

/** The naughty girls on a night out (naughtyboys.ts), at you or at each other. */
const GIRLS = [
  "Who you looking at?", "Hold my bag!", "Hold my bag, Shaz!", "Get off my man!", "You what?", "Come on then!",
  "Say that again, I dare you!", "She ain't worth it, babe!", "Leave it, Kayleigh!", "I'll have your extensions out!",
  "Don't you dare touch my hair!", "Do you know who my boyfriend is?", "Shazza! Get over here!", "Not in these heels!",
  "Are you starting?", "That's my kebab!", "Mind my nails!", "I'm not even drunk!",
];

/** Something for one of the posh lot (or the Flag Lads, or a naughty girl) to shout. kind 1 is rugby, 2 cricket, 3 a Flag Lad, 5 the Gaffer, 6 a naughty girl. */
export function line(kind: number) {
  if (kind === 6) return GIRLS[Math.floor(Math.random() * GIRLS.length)];
  if (kind >= 3) { const own = kind === 5 ? CHAIR : SOCIETY; return own[Math.floor(Math.random() * own.length)]; }
  const own = kind === 1 ? RUGBY : CRICKET;
  const all = Math.random() < 0.3 ? own : ANYONE;
  return all[Math.floor(Math.random() * all.length)];
}

/** What they shout as they pick themselves up and leg it (naughtyboys.ts), once they've had enough. By kind, as above, and 0 a naughty boy. */
const LEG_IT = [
  ["Leave it!", "I'm telling my mum!", "You're mental, you!", "Not the face!", "I'm going home!", "This is my best trackie!"],
  ["I'm telling Matron!", "My kit's ruined!", "Retreat, chaps!", "I need my inhaler!", "That's a yellow card!"],
  ["Bad light! Stumps!", "Rain stopped play!", "I'm retiring hurt!", "My whites!", "Fetch the umpire!"],
  ["I'm telling the group chat!", "My nan's waiting!", "Tactical withdrawal!", "That's going on Facebook!"],
  ["I'm only the ladder man!", "Not the ladder!", "I'm on a day rate!"],
  ["You'll be hearing from my solicitor!", "Lads? Lads?!", "It's a strategic regroup!"],
  ["I've broke a heel!", "My nails!", "I'm telling Darren!", "Where's my bag?", "I'm getting a taxi!", "Ugh, you've ruined my night!"],
];
export function legIt(kind: number) {
  const own = LEG_IT[kind] ?? LEG_IT[0];
  return own[Math.floor(Math.random() * own.length)];
}

const synth = typeof speechSynthesis !== "undefined" ? speechSynthesis : null;
const MALE = /daniel|arthur|oliver|george|ryan|thomas|alfie|elliot|harry|male/i;
const FEMALE = /female|serena|kate|stephanie|martha|hazel|libby|sonia|maisie|susan|fiona/i;
let voices: SpeechSynthesisVoice[] = [], women: SpeechSynthesisVoice[] = [];
/** Voices to pick from, best first: British men, then any British voice, then any English one (and
 *  the same for the women's voices, for the naughty girls). */
function load() {
  const all = synth?.getVoices() ?? [];
  const lang = (v: SpeechSynthesisVoice) => v.lang.replace("_", "-").toLowerCase();
  const gb = all.filter((v) => lang(v) === "en-gb"), en = all.filter((v) => lang(v).startsWith("en"));
  const men = gb.filter((v) => MALE.test(v.name) || !FEMALE.test(v.name));
  voices = men.length ? men : gb.length ? gb : en;
  const her = gb.filter((v) => FEMALE.test(v.name)), anyHer = en.filter((v) => FEMALE.test(v.name));
  women = her.length ? her : anyHer.length ? anyHer : gb.length ? gb : en;
}
if (synth) {
  load();
  synth.addEventListener?.("voiceschanged", load);
  // some browsers (iOS) only speak once speech has started from a tap or a key press
  let primed = false;
  const prime = () => {
    if (primed) return;
    primed = true;
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    synth.speak(u);
  };
  addEventListener("pointerdown", prime, { once: true });
  addEventListener("keydown", prime, { once: true });
}

/**
 * Say a line out loud, distance metres away. seed gives each of them a voice of their own. One at a
 * time, and never over your own one-liners (quips.ts): while anything is being said, they keep quiet.
 * own: a voice set by hand instead (breakdown.ts): which of the voices (counting round if there are
 * fewer), at this pitch. woman: a woman's voice (a naughty girl), pitched a bit higher. pitch: their
 * own voice, but this high (1.5 for one legging it, scared).
 */
export function speak(text: string, seed: number, distance: number, own?: { voice: number; pitch: number; rate?: number }, woman = false, pitch?: number) {
  if (!synth || distance > 55 || document.hidden || synth.speaking || synth.pending) return;
  const r = (k: number) => { const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
  const u = new SpeechSynthesisUtterance(text);
  const pool = woman ? women : voices;
  const v = pool.length ? pool[own ? own.voice % pool.length : Math.floor(r(3) * pool.length)] : null;
  if (v) u.voice = v;
  u.lang = v?.lang ?? "en-GB";
  u.pitch = pitch ?? own?.pitch ?? (woman ? 1.05 + r(1) * 0.35 : 0.65 + r(1) * 0.4);
  u.rate = own?.rate ?? 0.95 + r(2) * 0.15;
  u.volume = Math.min(1, 10 / (distance + 10)) * SFX.effectsVolume();
  if (u.volume === 0) return;
  synth.speak(u);
}
