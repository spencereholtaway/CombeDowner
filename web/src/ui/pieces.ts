// What the HUD page (ui.html) shows: every message and piece the game puts over the streets, sorted
// by the question the player is asking, with where each is drawn, who uses it and the states to step
// through. Only the words live here, so the catalogue can list them without loading the game;
// stage.ts draws each state with the game's own code.

export interface Piece {
  id: string; group: string; name: string;
  /** The call that draws it. */
  api?: string;
  /** Where it's drawn: module and function. */
  src: string;
  used: string;
  /** A deliberate one-off look. */
  event?: boolean;
  /** Shown across the whole row: a card or page bigger than a line. */
  wide?: boolean;
  note?: string;
  states: string[];
}

/** The categories, in the order of the page: what each answers, where it sits and how it looks.
 *  slot: the box on the slot map, as left/top/width/height percentages of the screen. */
export const GROUPS = [
  { id: "guide", name: "Guidance", ask: "What do I do now?", where: "Under the crosshair", look: "The use prompt: a dark strip, keys as gold caps", slot: [[34, 55, 32, 8]] },
  { id: "news", name: "News", ask: "What just happened?", where: "A little above the middle", look: "A plate, big for a few words, smaller for more", slot: [[33, 23, 34, 8]] },
  { id: "mission", name: "Mission", ask: "How's my job going?", where: "The brief top middle, the panel top left, stage calls over the crosshair", look: "Paper for the brief and result; plates in the mission's colour", slot: [[2, 9, 22, 30], [30, 35, 40, 10], [33, 13, 34, 9]] },
  { id: "score", name: "Score", ask: "How am I doing right now?", where: "The meter slot, under the crosshair", look: "Gold numbers with no plate, live and climbing", slot: [[38, 65, 24, 10]] },
  { id: "reward", name: "Rewards", ask: "What have I earned to keep?", where: "Top middle, or on the result card", look: "A gold-edged plate with its medal or picture", slot: [[37, 6, 26, 6]] },
  { id: "people", name: "People", ask: "Who's around?", where: "Top right, under the minimap", look: "Plain lines that fade", slot: [[78, 30, 20, 18]] },
  { id: "system", name: "System", ask: "Is the game all right?", where: "A strip along the top", look: "BathText teletext", slot: [[30, 0.5, 40, 4.5]] },
  { id: "world", name: "In the world", ask: "What's Bath saying?", where: "Its own place: a page, a bubble, the phone", look: "Props: the Chronicle, speech bubbles, the zone opening", slot: [] as number[][] },
  { id: "frame", name: "Frames and slots", ask: "Where does everything go?", where: "The whole screen", look: "The slot map", slot: [] as number[][] },
];

/** The title card's samples, under the brief. */
const TITLES = ["Job", "Long goal", "Race", "Wanted", "Challenge, with a best", "Bonfire", "Bus driver", "Pub takeover", "Shoot-out", "Long, two-line title"];

export const ELEMENTS: Piece[] = [
  // ---- guidance
  { id: "use", group: "guide", api: "usePrompt(html)", name: "Use prompt", src: "useprompt.ts usePrompt(), keycaps(); written by game.ts",
    used: "everything you can use: vehicles, doors, noticeboards, pubs, buses, the mines door, a job's own use",
    note: "Each key is a key cap; on a touch screen the use and ride caps are buttons. Hidden while a result card is up.",
    states: ["Take the job", "Challenge", "Busy", "Get in", "Riding", "Job's own", "Touch key cap", "Keeper (shoot-out)"] },
  { id: "guide", group: "guide", api: "guide(text)", name: "Guidance line", src: "notice.ts guide() (#guide)",
    used: "a mode's instructions, the examiner's directions, how to use what you've picked up, the keeper's dive",
    note: "Queued like news, and held back while a title card or countdown is up. Sits just under the use prompt when one is up.",
    states: ["Instruction", "With key caps", "Under the use prompt", "Long instruction", "The examiner"] },
  // ---- news
  { id: "news", group: "news", api: "news(text)", name: "News plate", src: "notice.ts news() (#toast); Game.news, the modes' toast",
    used: "kills, pickups, the speed trap, arriving in town, a pub won back, the town safe, what happens in a mode",
    note: "One queue: a newer line waits until the one up has been read. Over 64 characters it wraps smaller. Up for as long as it takes to read.",
    states: ["A kill", "A pickup", "The speed trap", "Arriving", "Long (wraps smaller)", "A critic's remark"] },
  // ---- mission
  { id: "entries", group: "mission", name: "Entries banner and line-up", src: "missionscreens.ts missionWaiting(), from lineup.ts",
    used: "every noticeboard job and challenge", note: "Skipped on your own: entries only open with others in the room.", states: ["Entries open", "You're in", "Lining up", "Long title"] },
  { id: "brief", group: "mission", wide: true, name: "A job's brief: the board, the title card, J", src: "brief.ts briefHtml(); quests.ts Quests.hud() (#jobposter, #jobrecall); missionscreens.ts missionBegin() (the title card)",
    used: "every noticeboard job and challenge, the bonfire, a bus shift, a pub takeover, a shoot-out, the night out, and Wanted's round on J", note: "One cutting at the board, as the title card and on J. At the board its foot is the use prompt.",
    states: ["Board: job", "Board: challenge", "Board: done today", "Board: touch", ...TITLES.map((t) => `Title card: ${t}`), "Recall (J)", "Recall: Wanted"] },
  { id: "count", group: "mission", name: "Gathering, and the 3, 2, 1 start", src: "missionscreens.ts missionWaiting(), missionCountdown(n, colour, style), countdownFor(start, players); LineupConfig.start",
    used: "every job and challenge: a mode says only start: race, timed or calm", note: "Others about: the join window in the mission colour, with a count. Then, only where several start together: a race gets the lights, any other timed mode a plain 3, 2, 1, GO!, a calm mode none. Solo, no countdown: the clock starts as the title card goes.",
    states: ["Gathering (others about)", "Race lights 3", "Timed plain 3", "Solo timed (no countdown)", "Calm (none)"] },
  { id: "stage", group: "mission", api: "missionCall({ text, sub, colour, went })", name: "Stage call", src: "missionscreens.ts missionCall()",
    used: "waves, checkpoints, lives, Wanted's getaways, a scar put right", note: "In the mission's colour, or green, red or amber when it went well, badly or close.", states: ["Wave", "Checkpoint split", "Life lost", "Out of lives", "He got away"] },
  { id: "mprog", group: "mission", name: "Status panel", src: "missionscreens.ts missionProgress() (.mprog in #mstack)",
    used: "every job and challenge, the bonfire, the bus driver, the shoot-out",
    states: ["Seagull Attack", "Race", "Wanted", "Challenge, with lives", "Bonfire", "Bus driver", "Bus stopping", "Shoot-out", "Flash (just changed)", "Long text"] },
  { id: "stack", group: "mission", name: "Top-left slot, stacked", src: "missionscreens.ts #mstack, with invasion.ts's #bunting as its last row",
    used: "a job, a bus shift and the Flag Lads at once", states: ["Job, bus and Flag Lads", "Job and Flag Lads", "Flag Lads alone"] },
  { id: "aux", group: "mission", name: "Meter slot under the crosshair", src: "missionscreens.ts missionAux(), missionAuxAdopt() (#maux, .aux-word/.aux-big/.aux-meter/.aux-panel)",
    used: "Push the Bus beat and cab, the Climb's grip, a race's gate clock, the combo row, the wings' flight", states: ["Gate clock", "Gate clock, running out", "Push the Bus beat", "Push the Bus cab", "Climb grip"] },
  { id: "banner", group: "mission", name: "Banner going up", src: "invasion.ts bannerBar() (#banner, .panel)", used: "pub takeovers", states: ["Going up", "Nearly up"] },
  { id: "spec", group: "mission", name: "Watching the others", src: "missionscreens.ts missionWatching()", used: "races, once you're over the line", states: ["Standings"] },
  { id: "result", group: "mission", wide: true, name: "Result card", src: "missionscreens.ts missionResult()",
    used: "every job, challenge, race, Wanted, the bonfire, a bus shift, a pub takeover, a shoot-out, the Flag Lads cleared",
    states: ["Job done, with rewards", "Job failed", "Called off", "Race: gold", "Race: did not finish", "Wanted: cuffed", "Wanted: got away", "Bonfire built", "Shift over", "Pub won back", "Town safe", "Long title"] },
  { id: "variants", group: "mission", wide: true, name: "Result card variants", src: "missionscreens.ts missionSheet(), missionNight(), missionResult({ variant: \"verdict\" })",
    used: "the driving test's report, the night out's front page, the gallery's verdict", states: ["Driving test: pass", "Driving test: fail", "Night out front page", "Gallery verdict"] },
  // ---- score
  { id: "combo", group: "score", api: "comboLine(source, line)", name: "The combo row, in the meter slot", src: "combo.ts comboLine(), fed by ridetricks.ts and flagjuice.ts (the Flag Lads' states here are the game's own FlagJuice)",
    used: "riding tricks, and shooting the Flag Lads' flags", note: "One row: each source keeps its own count and scoring and labels its line. Both at once stack, the newer on top.",
    states: ["Ride", "Ride: landed", "Ride: new best", "Ride: bailed", "Flags ×2", "Flags ×7", "Flags: running out", "Flags: cluster cleared", "Flags: combo over", "Both chained", "Both: bailed, flags still going"] },
  { id: "score", group: "score", api: "score({ text, sub, final })", name: "Score pop", src: "notice.ts score() (#trick, under the combo row)",
    used: "the Flag Lads' flags, trick shots, a race's boost and barges, a clean wave", states: ["Bunting down", "Trick shot", "Boost", "Barged", "Combo over"] },
  // ---- rewards
  { id: "reward", group: "reward", api: "reward({ kicker, text, sub, grade, pic })", name: "Reward plate", src: "notice.ts reward() (#award); itempic.ts itemPicture() for a wardrobe item",
    used: "trophies, wardrobe items; written on the result card instead while one is up", note: "A wardrobe item shows its own picture in place of the medal, drawn once; the medal stays if it can't be drawn.",
    states: ["Trophy: gold", "Trophy: silver", "Wardrobe item: Deerstalker", "Wardrobe item: Traffic cone", "On the result card"] },
  // ---- people
  { id: "people", group: "people", api: "people(line, door), named(name, colour)", name: "Feed", src: "notice.ts people() (#feed); Game.feed, Game.notice",
    used: "who took a job, who fell, a takeover, who joined or left", states: ["Three lines", "Someone joined", "Someone left", "A busy minute"] },
  // ---- system
  { id: "system", group: "system", api: "systemNote(key, { text, tone })", name: "The game's notes about itself", src: "notice.ts systemNote(), from loadnote.ts, net.ts, safegfx.ts",
    used: "the map stuck loading, someone on another version, safe graphics after a crash", states: ["Map stuck loading", "Another version", "Older version", "Safe graphics"] },
  { id: "mapcard", group: "system", name: "The big map's cards", src: "pubmap.ts (#pubcard), mapkey.ts (#keytip), minimap.ts tooltip(): .ttmini", used: "the big map, Go to a pub", note: "BathText, as the pause menu's Go to a pub (page 600) is.", states: ["Pub card", "Pub card, held up", "Key note"] },
  // ---- in the world
  { id: "chron", group: "world", wide: true, name: "The Chronicle, and the league table", src: "daily.ts Daily.draw() into #scoreboard; game.ts renderScores()", used: "on joining, Tab (with the league table as the top of its page), the pause menu, noticeboards", states: ["On joining", "Tab: league table"] },
  { id: "reveal", group: "world", wide: true, name: "Zone opening card", src: "reveal.ts Reveal.card() (#reveal)", used: "a zone opening; the whole map", event: true,
    note: "The big celebration: its own letterbox look on purpose.", states: ["New zone", "Whole map"] },
  { id: "revealload", group: "world", wide: true, name: "Zone opening: loading screen", src: "reveal.ts Reveal.card(), loadingLook(), loadingHit() (#reveal .rvveil)", used: "under the cover while a zone opening's squares load, before its fly-over", event: true,
    note: "Something's happening, with a snare drum rolling and the bars filling; the drum roll swells as they fill and the cymbal lands as the cover lifts into the flight. Here the loading is pretend, on a loop, and silent.", states: ["Loading, on a loop"] },
  // ---- frames and slots
  { id: "slots", group: "frame", wide: true, name: "Slot map", src: "style.css (the status panel slots), drawn all at once with each slot outlined",
    used: "the whole HUD", note: "Try the phone size: the touch layout puts the top-left slot in the left column, clear of the buttons.", states: ["Desktop", "Touch"] },
];
