# Combe Downer

A multiplayer first-person shooter in the browser, set in Combe Down, Bath, and built from real
open data. There is also a co-op dungeon crawl in the stone mines under the village ("Under Combe
Down"). `README.md` is the short front page and `docs/playing.md` describes the game from the
player's side; this file is for agents working on the code.

Two people work on this repo at the same time, each with their own agents: **Spencer**
(spencereholtaway, who owns the repo) and **Dan** (danturn). Read "Working alongside each other"
below before you merge anything.

Also read `NOTES-FOR-AGENTS.md` before you start: it lists what each person's agents are changing
right now. Add your own in-flight work there, and remove it once it's merged.

## The map is the whole of Bath

The game was expanded from Combe Down to the whole of Bath. Bath is not an add-on round the
village: it is the map, and everything that works in Combe Down must work everywhere in Bath in
the same way. That includes traffic, naughty boys and the posh teams, cats, pickups, buses you can call,
parked cars you can drive, ball games on the pitches, landmarks and anything new. In the code,
all of Bath, Combe Down included, comes in as full-detail squares (`map.tiles`, `tiles.ts`) plus
the city-wide `map.wide` data; the first area (`map.d`) holds only what belongs to the map as a
whole (Hackney and the single-file build are still one area of their own). So never read only
`map.d` (its roads, street furniture, shops, pitches) for gameplay: use `map.areas()`, `map.tilesNear()`,
`map.wide`, or the helpers built on them (`hauntsNear` and `streetSpot` in `haunts.ts`,
`vehicles.stopsNear`). Test new features out in Bath (for example by going to a pub in town), not
just in Combe Down.

## Workflow

- When a piece of work is done and checked (`cd web && npm run build` passes), merge it into
  `main` and push `main` straight away. Don't ask first and don't wait for a pull request: pushing
  `main` publishes the game to GitHub Pages, and that is the point.
- Before merging, bring in the latest `origin/main` and resolve any conflicts, keeping both sides'
  features.
- Check `TODO.md` for open fixes and ideas, and tick off anything you finish.

## Working alongside each other

- `main` on `spencereholtaway/CombeDowner` is the one true copy, and it is what's live. Both people
  push to it, often several times a day, so **fetch `origin/main` when you start and again just
  before you merge**. Never force-push `main`, and never rewrite history someone else has pushed.
- Branch names: Dan's work goes on `dan/<topic>` and agents' work on `claude/<topic>`. Dan
  sometimes works from his fork (`danturn/CombeDowner`) and merges in through a pull request; if
  you're in the fork, `main` there is not the live one, so bring in Spencer's `main` too.
- When you resolve a conflict, keep both sides' features. Never drop, revert or quietly rewrite
  something the other person built to make your change fit: if the two really can't live together,
  stop and ask the user. `git log -- <file>` shows who last worked on what.
- Files most likely to conflict, because everything touches them: `web/src/game.ts` (the match),
  `web/src/net.ts` (the `MESSAGE_TYPES` list), `web/src/main.ts`, `web/index.html`,
  `web/src/style.css`, `README.md` and `docs/playing.md`. Make small, local edits there rather
  than reshuffling.
- Anyone can work anywhere, but expect the other person to have work in progress. Dan has done a
  lot of the mines (`web/src/mines/`, `web/mines.html`), traffic and the building and roof work.
  Check `git log origin/main -- <path>` and the open `dan/*` and `claude/*` branches
  (`git branch -r`) before you make big changes to an area.
- Don't commit build output, `node_modules`, logs or raw map downloads (`data/raw/` is ignored).
  The map's inputs *are* kept, compactly, in `data/combe-down/` (`tools/mapdata.py`): rebuild from
  those (README.md, "Rebuild a map"), and repack them only after measuring afresh from raw data.

## Running and checking

```sh
cd web
npm install
npm run dev          # http://localhost:5173 (the game); /mines.html is the mines
npm run build        # tsc --noEmit then vite build: this is the check before merging
```

There are no unit tests: the build's typecheck is the gate, then play it.

**Spencer doesn't want screenshots.** For Spencer's work, don't drive the game in a headless
browser to take screenshots (it's slow): once the build passes, merge and push, and Spencer
checks it by eye. Only use screenshots when Spencer has looked at something and asked for more
work on it. Useful URL options:

- `?net=local` links tabs in one browser (BroadcastChannel) instead of WebRTC, to test multiplayer
  on one machine. It can't carry voice. Add `&lag=150,60,400` to hold what comes into a tab for
  150 ms, give or take 60, with a 400 ms hold-up now and then, as a player across the Atlantic has.
- `?fx=0` turns off the retro colour grade, `?res=full` renders at full resolution.
- `?trees=flat` draws every tree and shrub as a flat picture facing you, close up too (normally
  only far-off ones are; `web/src/trees.ts`).
- `?nightout=1` makes every night a Friday night out, with the crowd at the top of Milsom Street
  (`nightOut` in `web/src/daylight.ts`, `naughtyboys.ts`).
- `?view=1200` sets how far you can see (the fog's reach in metres; `web/src/view.ts`), to try a machine's frame rate.
- `?at=east,north,bearing,tilt` starts you at that spot facing that way (data metres, then degrees
  clockwise from north and up from level), and the menu backdrop looks from there (a fifth number
  lifts the backdrop that many metres off the ground, for views from the air). Shift+F3 copies a
  link to where you're standing.
- `?room=CODE` joins a game, `?map=<id>` picks the map.
- `?progression=1|0` switches the zones, the strange objects and structures, and the team challenges
  on or off together for one visit (`web/src/features.ts`). By default they're on at
  danturn.github.io and on a local copy, and off on Spencer's live site. In a room, the host's say
  counts for everyone; new code for any of the three should check `feature()` rather than assume
  it's on.
- Mines only: `?go=1` skips the menu, `?depth=3` starts that far down, `?class=mage` skips the class
  choice, `?seed=...` fixes the level.

### Running the game locally, without the sound

Every tool that opens the game in Chrome imports `tools/quiet-guard.mjs`, which

- launches Chrome with `MUTED_ARGS` (`--mute-audio --disable-audio-output`, and no autoplay);
- replaces the page's `AudioContext` with an `OfflineAudioContext`, so what the game plays goes into
  a buffer nobody hears;
- replaces `HTMLMediaElement.prototype.play` and `speechSynthesis.speak` with counters, so nothing
  plays or speaks and the run can report that the game tried.

Call `silence(page)` after making a page, or `silenceContext(context)` after making a context (for
the probes that open a page per map), both before the first `goto`:

```js
const browser = await chromium.launch({ channel: "chrome", args: [...MUTED_ARGS] });
const page = await browser.newPage();
await silence(page);
```

**Do not write your own copy of these.** A tool that passes `--mute-audio` and stops there is the
run that leaks: `tools/travel_probe.mjs` used to, and its comment claimed the flag was enough.

What is not known: nobody has measured whether `--mute-audio` covers `speechSynthesis` on a Mac.
The guards above are what make a run silent either way, and until someone checks, don't rely on the
flag.

### Screenshots, and checking one part of the map

Screenshots are quick and easy to make: `cd web && npm run shoot -- "<?at= value>" ...` builds the
game and shoots each view in a muted headless Chrome (`tools/shoot.mjs`; the top of the file has
the options). Views are `?at=` values, which Shift+F3 in the game copies, given on the command line
or in a views file. It shoots from the menu's backdrop and waits until the squares round each view
are built, so a view takes a second or two on a machine with a graphics card. `--play` starts a
solo game for shots that need traffic, naughty boys or the HUD. Use it rather than writing a browser
script of your own, and never wait a fixed time for the map to load.

When a change to the map tools is about one place, don't rebuild the whole map to look at it.
`python3 -I tools/square_at.py "<?at= value>"` says which squares the view is in (the village's
nine go together) and prints the two commands: rebuild just those squares
(`tools/prep_tiles.py ... --only ti,tj ...`), then shoot the view. Rebuild the whole map, and
run the clash check (`tools/check_map.py`), once the change is right.

On Dan's fork, Dan's agents run full map builds and screenshots on Dan's Mac, through the
project's coordinator, with `tools/mac_build.sh <commit> --map [--only "ti,tj ..."] [--check]
[--shots views.json] [--push <branch>]`. It waits for any other build to finish, builds in a
throwaway worktree, reuses a commit it has already built, and writes the timings, changed files,
clash check and shots to one report folder. A cloud container has no graphics card, so take one
frame there at most.

Voice chat's delay from one player's mic to another's ears can be measured with
`node tools/voicelag.mjs --game` (two pages linked over real WebRTC, fake mic; `--old` for the
settings before it was tuned, and the top of the file has the rest).

Soundtrack tracks can be checked with `node tools/check_tracks.mjs web/src/tracks/<track>.ts`
(after `npm install`).

## How the code fits together

- `web/` is a Vite + TypeScript + three.js app with three pages: `index.html` → `src/main.ts` (the
  streets game), `mines.html` → `src/mines/main.ts` (the mines) and `deli.html` → `src/deli/main.ts`
  (COMBE DOWN WITH ME, the deli cooking game), plus `characters.html` → `src/characters.ts` (who's who:
  every street character on a turntable, drawn by the game's own model code; add new ones there) and
  `whatswhat.html` → `src/whatswhat.ts` (what's what: every set piece and landmark placed as the game
  places it, and every vehicle, in full, untextured or wireframe, and in AR; set pieces turn up there
  by themselves, other new landmarks and vehicles need a line in its list). The build publishes `web/dist`.
- **No asset files.** Textures are drawn on canvases in code (`textures.ts`, `mines/art.ts`,
  `mines/icons.ts`), models are built from primitives in code, and all sound and music is
  synthesised with Web Audio (`audio.ts`, `music.ts`, tracks in `src/tracks/`). Keep it that way.
- **The map** is built by the Python tools in `tools/` from Overture Maps, Environment Agency
  lidar, tree canopy, energy certificates and OSM, all of Bath in one run of square builds
  (`tools/prep_tiles.py` running `tools/prep_map.py --tile`; see `README.md` and
  `docs/new-area.md`). The village is the middle 3 x 3 squares, loaded like the rest: all are
  `web/public/maps/combe-down/<ti>_<tj>.json` (as the partition stage writes them, below), streamed in round the player, and
  `web/public/maps/combe-down.json` holds only what belongs to the map as a whole. `map.ts` loads them and answers ground height,
  collision and raycasts; `world.ts` builds the scene from it. Data coordinates are metres east (x)
  and north (y) of the map centre; scene coordinates are X east, Y up, Z = -north. Don't hand-edit
  the JSON: change the tools and rebuild. Hand-made landmarks are plugins in `src/landmarks/`,
  placed by `tools/landmarks/bath.py`. Set pieces (Bath Abbey, Pulteney Bridge, the Roman Baths,
  Argyle Street, Great Pulteney Street, Grand Parade, the Empire Hotel, the Holburne Museum, Sham
  Castle, Prior Park, Kingswood School, the Bell Inn, Grenville's monument on Lansdown and Bath Spa
  station:
  `src/landmarks/setpieces.ts`) are different: the game hides what the build put inside their
  outlines as each square loads and draws the hand-made model instead, so the map tools and files
  stay as they are. Rebuilding squares needs nothing doing for them.
- **Everything on the ground is laid out in one order**, so things fit together instead of being
  cut apart afterwards. In `tools/prep_map.py`, measured things go first and never move:
  buildings, then real walls (mapped walls, and the lidar's from `tools/walls.py`).
  - Next come the streets, fitted between those walls and buildings (`tools/roadwidth.py`), lanes
    and drives too. A street's `w` and `pv` are its only width, for every later step and for the
    game. A street whose line runs on through a building stops at its wall.
  - Then come the gardens: one network of boundaries, each laid once (`tools/gardens.py`). The
    side and back boundaries come from every garden's edge at once, so two neighbours share one
    fence and there is no gap between two guesses at it. A real wall takes the place of a guessed
    front, and gates are set into their walls; between gardens the guessed fence stands where the
    lidar sees a wall along it. Nothing guessed stands on a footpath, a short sideways step in a
    fence is straightened out, and a loose bit that meets nothing goes. Guessed
    boundaries run straight and square to their house wherever they can (a fence that wanders less
    than 3 m off a straight line, with nothing in the way, is drawn straight once the runs are
    joined up, and fences ending on it slide along to meet it), and bend only where
    something laid before them makes them (a street, a path, a real wall, the plot's own shape).
    Between and behind gardens a boundary is a wooden fence or a hedge, one or the other all round
    each back yard (every garden backing on to one another round a block), and a wall the lidar
    sees there is built as that garden's fence or hedge. A row of houses along a street shares one
    front style. A
    boundary that stops just short of another, or of a house, runs on to meet it.
  - Walls are opened only where a path or street crosses them, and kept off the carriageway and
    the pavement; a stub left standing on its own goes, and a gate left without its wall opens.
  - Small things (trees, shrubs, street items, front paths, cars) are placed last, clear of
    all of that.

  The canal breaks this order on purpose: it cuts through the land. Its banks, coping, towpath,
  verges and retaining walls are designed once for the whole canal (`tools/canal.py`) and built
  by the game as their own ground (`web/src/works.ts`), with the square's 4 m ground grid cut
  away exactly along their outer edge, because the grid is coarser than the canal and laid into
  it the banks come out in teeth. The build leaves the ground there as it lies, keeps mapped
  towpaths level on the canal's towpath, and leaves the ground over the canal's tunnels (and the
  streets on it) alone; the game clears the ground out of the tunnels' bores. Bridges are
  carried straight from abutment to abutment once every span is decided (`carry_spans` in
  `tools/prep_map.py`), along whole roads, not the pieces the data splits them into; and the
  roads are smoothed as one network before that (`smooth_network`: main roads first, side roads
  meeting them at their height, no steeper than the hill), as the railway is (`tools/railway.py`;
  the levelling both share is `tools/profiles.py`).

  Then, for Bath, the **partition** lays all of that out again as one partition of the ground,
  the last stage of `tools/prep_tiles.py` (`tools/partition/stage.py`): the streets are fitted
  once across the whole city (`tools/partition/once.py`, `corridors.py`), their heights,
  bridges and tunnels worked out together (`tools/structures.py`, `profiles.py`), the blocks
  divided into plots that follow the Land Registry's parcels (`plots.py`), and every boundary,
  gate, front path and the ground under the roads written into each square from those
  (`write_tile.py`), over `prep_map.py`'s square for everything else. So the streets, plots,
  garden boundaries and road heights the game shows come from there, and new rules for them go
  into `tools/partition/` or `tools/structures.py`, not `prep_map.py` alone.

  A new kind of thing, or a fix for things clashing, goes into this order as a rule, not as
  a clean-up step on top. Rule 9 of `tools/check_map.py` counts the clashes (lone gates,
  doubled fences, things on walls or indoors, paths through walls, walls off their ground or on a
  pavement, buildings in the road). Run it before and after
  a map change, and don't let the counts go up.
- **Multiplayer is peer to peer**, with no server (`net.ts`: Trystero over WebRTC, or
  BroadcastChannel for `?net=local`). The **host is the player with the lowest id**, and if they
  leave the next one takes over. The rules, set out at the top of `game.ts` and `mines/game.ts`:
  - each player moves themselves and sends their position ("st") about 20 times a second;
  - the shooter decides their own hits and tells the host; the host applies damage, kills and
    scores and tells everyone;
  - the host runs everything shared that thinks for itself (naughty boys, cats, traffic, pickups, who
    sits where in vehicles, the mine monsters and bosses) and sends its state about 10 times a
    second; everyone else just draws it, smoothed;
  - the mines send only a seed: every player generates the same level from it (`mines/gen.ts`),
    so generation must stay deterministic for a given seed.

  A new kind of message needs its name added to `MESSAGE_TYPES` in `net.ts` (Trystero action
  names, so keep them a few letters long). Players on an older page in the same room won't know
  it, so new messages should be safe to ignore.
- Main modules in `web/src/`: `game.ts` (the match, and the hub everything plugs into),
  `player.ts` (movement and collision, shared with the mines), `weapon.ts`, `naughtyboys.ts` +
  `haunts.ts` + `posh.ts`, `cats.ts`, `vehicles.ts`, `traffic.ts`, `pickups.ts`, `sport.ts` +
  `pitches.ts` + `broadcast.ts`, `voice.ts`, `furniture.ts`, `trees.ts`, `grass.ts`, `post.ts`
  (the retro render), `minimap.ts`, `touch.ts` (touch-screen controls), `minetour.ts` (the door from
  the streets into the mines). In `mines/`: `game.ts`, `gen.ts`, `level.ts`, `mobs.ts` +
  `mobviews.ts`, `bosses.ts` + `bossfx.ts`, `puzzles.ts`, `items.ts`, `viewmodel.ts`.
- Every source file opens with a comment saying what it is and who decides what over the network.
  Read that first, and keep it true when you change the file.
- It has to run well on iPads and phones as well as desktops: keep draw calls down (instancing,
  merged geometry, `cull.ts`) and make sure anything new works with touch controls too.

## Style

- Comments and docs are in plain British English, explaining what happens in the game rather than
  in programming terms, in the same voice as the existing ones.
- When you add or change something a player would notice, update `docs/playing.md` to match (and
  `README.md` only if it changes the short summary there).
- Commit messages are a short plain sentence about what changed for the player, e.g. "Traffic
  pulls round parked cars, and you can stand on car and building roofs".
