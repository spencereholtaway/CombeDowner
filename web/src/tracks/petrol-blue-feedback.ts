import { defineTrack } from "./notation";

// The tape in the deck of the petrol blue Golf Driver on Cranhill Road (golfdriver.ts), side A of
// "Bath Moon Rising": our own noise-rock in the spirit of the late eighties New York guitar bands,
// F# drones on open strings, chords that rub a semitone against them, chiming harmonics up top and
// a motorik beat that never lets up. Not in the soundtrack until you've found the tape.
const MOTORIK = { k: "x.x...x.x.x...x.", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." };
const BUILD = { k: "x.x.x.x.x.x.x.x.", s: "....x.......x.x.", h: "x.x.x.x.x.x.x.x." };

export default defineTrack({
  name: "Petrol Blue Feedback",
  bpm: 136,
  key: 2,
  intro: "drone",
  tone: { bright: 1.35, lead: "bell", bass: "pick" },
  riffs: {
    // the open strings ringing on one chord, with the twelfth fret chiming over it
    drone: {
      guitar: [
        "o0 - - - - - - - o0 - - - o12 - - -",
        "o0 - - - - - - - o0 - - - o7 - - -",
        "o0 - - - - - - - o0 - - - o12 - - -",
        "o0 - - - o1 - - - o0 - - - o5 - - -",
      ],
      drums: MOTORIK, weight: 2,
    },
    // eighths on the drone, sliding up a semitone and back
    verse: {
      guitar: [
        "o0 . o0 . o0 . o1 - o0 . o0 . o12 - o0 .",
        "o0 . o0 . o0 . o1 - o0 . o0 . o10 - o8 -",
        "o0 . o0 . o0 . o1 - o0 . o0 . o12 - o0 .",
        "o5 - - - o3 - - - o1 - - - o0 - - -",
      ],
      lead: [
        "f#5 - - - - - - - c#6 - - - - - - -",
        "b5 - - - - - - - a5 - - - - - - -",
        "f#5 - - - - - - - c#6 - - - e6 - - -",
        "c#6 - - - b5 - - - a5 - - - - - - -",
      ],
      drums: MOTORIK, weight: 3,
    },
    // the lift: the chords climb, the harmonics ring out above
    lift: {
      guitar: [
        "o5 - - - - - o5 - o3 - - - - - o3 -",
        "o10 - - - - - o10 - o8 - - - o7 - - -",
        "o5 - - - - - o5 - o3 - - - - - o3 -",
        "o1 - - - o0 - - - o1 - - - o0 - - -",
      ],
      lead: [
        "b5 - - - - - - - - - - - a5 - - -",
        "e6 - - - - - - - c#6 - - - - - - -",
        "b5 - - - - - - - - - - - f#6 - - -",
        "e6 - - - - - c#6 - - - - - - - . .",
      ],
      drums: MOTORIK, weight: 2,
    },
    // the noise: everything at once, a semitone apart, louder and louder
    noise: {
      guitar: [
        "o0 o1 o0 o1 o0 o1 o0 o1 o0 o1 o0 o1 o0 o1 o0 o1",
        "o0 o1 o0 o1 o0 o1 o0 o1 o12 o13 o12 o13 o12 o13 o12 o13",
        "o0 o1 o0 o1 o0 o1 o0 o1 o0 o1 o0 o1 o0 o1 o0 o1",
        "o0 - - - - - - - - - - - - - - -",
      ],
      drums: BUILD, weight: 1,
    },
  },
});
