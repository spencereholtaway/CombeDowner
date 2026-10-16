# Bradford-on-Avon by train: feasibility and implementation plan

Checked against Dan's fork `danturn/CombeDowner` main at `f5f061b` (15 Oct 2026). Nothing here is
built. This version replaces the earlier "two lobes in one map" plan: each town is its own map (a
**place**), every player stays in the **same room**, and the train is the way between places. It
scales to Hackney, Norfolk or Yorkshire at a fixed cost, and **leaves Bath and today's game as they
are** (the one visible change in Bath is the outbound Bradford-on-Avon trains and the boarding
prompt at Bath Spa; see stage 3).

## Verdict

**Yes, and much of it is already in the code.** The game already lets players on different maps
share a room (`game.ts:22-23`): everyone says which map they're on in their `hello`, players on
another map go in an `elsewhere` set (`game.ts:302, 1183-1191`), their messages are dropped by the
`here()` wrapper (`game.ts:524`), and the host is chosen only from players on your own map
(`peers()` and `hostId`, `game.ts:883-891`). So each map already has its own host for traffic,
naughty boys, cats, pickups, vehicles and the canal. `main.ts` already loads and caches maps by id
and swaps the world over (`fetchMap`/`showMap`, `main.ts:105-131`).

What's missing for your requirements:

1. **Moving between maps mid-game.** Today the map is fixed when the game starts, and `elsewhere`
   only ever grows (a player is only taken out of it when they leave the room, `game.ts:605`).
2. **One match across maps.** Today scores are per map: a player on another map is deleted from
   the scoreboard (`game.ts:1188`) and `sb`/`hit`/`rs` go to your map's host.
3. **The radio across maps.** Voice links are made to every peer (`game.ts:597`), but who's talking
   is read from position updates, which are dropped for players elsewhere (`game.ts:1205, 1220`).
4. **A train that leaves Bath Spa towards Bradford-on-Avon.** `tools/railway.py` goes straight on
   at every set of points, so all eastbound trains go to Box (stage 3).
5. **Doors, boarding, the black screen and arriving.** None exist yet.
6. **Bradford-on-Avon's map**, built as its own map with the same tools.

## How your scenario plays out

Ann and Ben catch the train, Cat stays in Bath, Dev comes later.

- **Ann and Ben board** at Bath Spa with E during the dwell and pick Bradford-on-Avon. The screen
  goes black; their game loads Bradford-on-Avon's map; they step off on its platform. They send a
  fresh `hello` saying `map: "bradford-on-avon"`. Nobody leaves the room.
- **Cat** puts them in `elsewhere`: she stops drawing them, and their shots and traffic messages
  are dropped. That filter matters, because each map's coordinates start from its own centre, so
  Bradford-on-Avon's middle would otherwise appear as ghosts round the Hadley Arms.
- **The radio** (hold V) carries both ways: talk mode is read from everyone's position updates,
  but only the radio is played for players elsewhere, never the nearby voice.
- **Hosts**: Bradford-on-Avon's host is whichever of Ann and Ben has been in the game longest (the
  existing `hostId` rule over the players on that map). They run its traffic, naughty boys,
  pickups and so on. Kills and scores stay with one **match host** for the whole room.
- **Dev** catches a later train. The line has one timetable worked out from the clock on both
  maps, so Ann and Ben see Dev's train pull into Bradford-on-Avon and Dev step off it.
- **Coming back** is the same thing the other way.

## What changes, and what doesn't

| Stays exactly as it is | Changes |
|---|---|
| Bath's squares, wide file, ground, canal, cable car, pubs, landmarks, set pieces: no rebuild needed (stage 3 checks the squares come out byte for byte the same) | `combe-down-rail.json` gains the Bath Spa → Freshford route (trains on track that's already drawn) |
| Bath's force field (one circle), minimap, pub map, invasion, haunts | A boarding prompt at Bath Spa and Oldfield Park when a Bradford-on-Avon train is in |
| How a game starts, the menu, the mines, the deli, solo games | `game.ts`: map changes mid-game, a match host, radio from elsewhere |
| `MESSAGE_TYPES` (no new types) | `hello` gains nothing new (it already has `map`); `st` gains a train-seat field |
| Hackney and the single-file build | A new hidden map, `bradford-on-avon`, reached only by train |

A player who never takes a train plays exactly today's game. Older pages already treat players on
another map as `elsewhere`, so a traveller doesn't break a friend on an older page; they just
can't hear the traveller on the radio until they update.

## What was wrong in the original spec

| Spec says | What's true | Source |
|---|---|---|
| About 8 km from Bath Spa by rail | About 8.1 km **in a straight line**; about 15.5 km by rail (11.1 km from Bath Spa to where the line leaves Bath's circle near Freshford, then about 4.5 km down the valley). About ten minutes at timetable speed | `combe-down-rail.json` routes 0/1 |
| The line is "an extension of what's already built" | The track runs to the edge, but **no train runs outbound** on it: routes go straight on at the points, so eastbound trains all go to Box | `tools/railway.py:107-142` |
| "out under the city" | The line runs east through Sydney Gardens and up the valley; no tunnel under the city | |
| Two maps in one room is the most netcode | The room already handles two maps with a host each (`elsewhere`, `here()`, `hostId`). What's left is moving between them, one scoreboard and the radio | `game.ts:22-23, 302, 524, 883-891` |
| One big circle or two lobes | Neither: both stop working past the next town (Hackney is 160 km away). One map per town scales | |
| Boarding is "the same get in used for a parked car" | Car seats go through the host (`vin`/`vh`). Copy the cable car instead: the seat is decided on your machine and sent as an `st` extras field, like `cab` | `game.ts:1700-1720, 2845-2852` |
| Doors "copied from the cable car" | The door clock and chime copy across. The cable car is walk-in with no E; train carriages are one solid box each, with no inside | `cableway.ts:271-287`; `railway.ts:35-39` |
| Everyone sees the same train | To within each device's clock: trains read `Date.now()` every frame, unsmoothed. The cable car smooths its clock; the trains should too | `railway.ts:339`; `cableway.ts:295-302` |
| The Wessex trains are local trains | They're drawn as HSTs stopping only at Bath Spa (any route named Great Western over 15 km gets one) | `railway.ts:104-108, 155` |
| Black loading screen | No fade exists yet; "Go to a pub" moves you instantly | `game.ts:1081-1131` |
| ST86SW is already in the Bath lidar list | True, but the south of the town needs **ST85NW** too, and neither raw tile is on Dan's Mac | |
| Wiltshire certificates and Land Registry parcels | Certificates yes; **no tool reads Land Registry parcels**. The UPRN cut box in `docs/new-area.md` stops at longitude -2.25, the middle of the town | `tools/epc.py` |
| (not mentioned) | The Kennet and Avon runs through the town (Bradford Lock), so the canal pack needs an entry | `tools/canal.py:42-60` |

## Rules for whoever implements this

From the project instructions; they apply to every stage.

- **Map work goes to Dan's fork first** (`danturn/CombeDowner`) and is verified there by Dan before
  it goes near `spencereholtaway/CombeDowner`. Never push it straight to Spencer's main. A push to
  Spencer's main needs Dan's approval message quoted with its id.
- **Full map builds run on Dan's Mac**, never in a cloud container (quick single-square checks are
  fine in the container), in a throwaway worktree off `/Users/dan/CombeDowner`, using
  `/Users/dan/.venvs/combedowner`, via `tools/mac_build.sh`.
- **Ask the Mac through the queue**: write `/mnt/project-files/macq-<name>.req.md` (flat, new unique
  lowercase name, no dots) with `thread`, `kind` (test | build | push), `commit`, `run`, `return`,
  `push` (none | fork-main | spencer-main), `alone` (map builds and FPS probes = yes). Tell the
  coordinator "macq-<name>.req.md is waiting". Don't say it's running until
  `macq-<name>.running.md` exists; results come in `macq-<name>.done.md` and files prefixed `<name>-`.
- **Test game changes on the Mac** in muted headless Chrome (`--mute-audio`, audio stubbed), never
  grabbing mouse focus, and stop the dev server and every browser afterwards. Game tests run in
  parallel, each in its own worktree and port. Never run the game in a cloud browser.
- **Pushes to a main go one at a time, fast-forward only, never forced.**
- **Settle it with Spencer** (`CLAUDE.md`, "Working alongside each other"): the decisions below,
  before stage 1. Add the work to `NOTES-FOR-AGENTS.md` while it's in flight.
- Run `tools/check_map.py <map> web/public/maps --all` before and after every map change; Bath's
  counts must not go up.

## Stages

Each stage is a commit on a `claude/bradford-*` branch on Dan's fork. Stages 1-2 (the new map) and
4-6 (the game) can go in parallel; stage 3 (the railway) joins them.

### Stage 0: decisions with Spencer

Dan takes the decisions at the end of this file to Spencer and adds an entry to
`NOTES-FOR-AGENTS.md`.

### Stage 1: Bradford-on-Avon as its own map

`tools/area.py`: a new entry, built through the squares pipeline like Bath (one small header file,
squares, a wide file underneath):

```python
"bradford-on-avon": dict(
    name="Bradford-on-Avon",
    centre=(-2.2522, 51.3448),      # the station: fixed once anything is placed by coordinates
    field=600, half=700,            # the detailed box: the middle 3 x 3 squares
    zones=[...],                    # Bath-stone "georgian"/"victorian" round the Town Bridge, Newtown
                                    # and the Shambles, "suburb" elsewhere; positions from named places
    default_zone="suburb",
    spawn="Bradford-on-Avon",       # the platform
    z0=15,
    wide=dict(field=1200, field_centre=(0, 100), half=1600),
),
```

The sizes are decision 2. With field 1200 and data 1600 it's about 16 squares, about 15-20 MB at
today's average of 1.2 MB a square. Everything else in the build already takes a map id:

- `tools/landmarks/bradford_on_avon.py`: an empty pack to begin with (`place` returns `[]`), unless
  `landmarks.load` copes with a missing one (check `tools/landmarks/__init__.py`).
- `tools/canal.py` `PACKS["bradford-on-avon"]`: the long pound's level from Bath's pack (35.2 m),
  and Bradford Lock (its gates from the data, a lift of about 3.7 m).
- `tools/mac_build.sh`: `MAP=combe-down` is hard-coded (`:29`); add `--map-id <id>`, keeping
  `combe-down` as the default.
- `web/src/maps.ts`: `{ id: "bradford-on-avon", name: "Bradford-on-Avon", blurb: ..., wide: true,
  hidden: true }`. `hidden` keeps it out of the menu; whether you can also start a game there is
  decision 4.
- `docs/new-area.md`: the UPRN cut box widened to at least lon -2.70 to -2.18.

### Stage 2: download and build it

On the Mac (needs the network), raw data in `data/raw/bradford-on-avon/wide/`, following
`docs/new-area.md` and `tools/fetch.py bradford-on-avon`:

1. Overture layers at the same release as Bath (`RELEASE` in `area.py`).
2. OpenStreetMap businesses and streets, FSA ratings (`osm.py`, `fsa.py` with `wide`).
3. Lidar: ST85NW and ST86SW (DTM, first-return DSM, last-return DSM, about 450 MB in all).
4. Canopy: the same zoom-9 tile as Bath's (252,170).
5. Energy certificates, by hand (needs an account): **Wiltshire** domestic and non-domestic,
   filtered to BA15 postcodes, saved as `epc/certificates.csv` and `epc/non-domestic.csv`; OS
   Open UPRN cut to the new box as `epc/uprn.csv`.
6. Build in the README's order with `--measure`: `canal.py`, `railway.py`,
   `prep_tiles.py --force --measure`, `prep_wide.py --measure`, `pubs.py`, `ground_kinds.py`, then
   `tools/mapdata.py pack bradford-on-avon data/raw/bradford-on-avon/wide` so it rebuilds from the
   repository like Bath. Add `data/bradford-on-avon/README.md` (sources and licences, as Bath's).
7. `check_map.py bradford-on-avon --all` as its baseline, and shots of the station, the Town
   Bridge, the Tithe Barn and the Shambles.
8. Push the map files and data to `claude/bradford-map` on Dan's fork. Dan checks the map with
   `?map=bradford-on-avon` (a hidden map opens this way, `main.ts:96-98`).

Bath's files must not change in this stage.

### Stage 3: the railway on both maps

`tools/railway.py`:

- **Branching routes**: replace "straight on at the points" with every edge-to-edge path that
  never turns sharper than the existing `0.6` heading test, de-duplicated, keep-left as now. On
  Bath's map this adds the Bath Spa → Freshford (down Wessex) route; check no silly routes appear
  (e.g. via the Bathampton loop, track 13), and if they do, add a small pack naming the services to
  keep by their stations.
- **Write each route's service type** (`"k": "hst" | "local"`) into the file rather than guessing
  from the name (`railway.ts:155`), so the Bradford-on-Avon trains are two-car locals calling at
  every station.
- **Link the two ends of the line** with a small hand-written pack in `railway.py`, since the
  journey between maps isn't on either map:
  `LINKS = [("combe-down", "Bath Spa", "bradford-on-avon", "Bradford-on-Avon", "Wessex Main Line", seconds)]`.
  It writes into each map's rail file which of its routes carry on to the other map, which
  station there, and the journey time between the two stations (worked out from the real distance,
  about 15.5 km, with the same speed model `timetable()` uses, including the stops at Freshford and
  Avoncliff).
- On Bradford-on-Avon's map, routes run edge to edge through its station as on Bath's.

`web/src/railway.ts`:

- For a linked route, give its trains **the same service numbers on both maps**: service k is at
  Bath Spa at time `T(k)` and at Bradford-on-Avon at `T(k) + journey`. Today the phase comes from
  the route's index (`railway.ts:160-168`); a linked route takes its phase from the link instead,
  so it's the same on both maps. **Done** (`linkPhase` in `railway.ts`): a linked route's dwell at
  its station is put on a shared wall-clock grid, the line's routes spread evenly across it, so a
  train dwells at Bath Spa whenever one dwells at Bradford-on-Avon and a traveller steps off with a
  train at the platform behind them.
- A smoothed clock for every train, as `cableway.ts:295-302`.

**Check (Mac, `kind: build`)**: Bath's rail file gains the new routes, and its four existing
routes keep the same stops. Rebuild Bath's squares: the rail file is part of each square's build key
(`prep_tiles.py:189-192`), so they'll all rebuild, and **every one must come out byte for byte the
same** (`changed.txt` lists only the rail file). If any square changes, find out why before going
on.

### Stage 4: one match across maps

All in `web/src/game.ts`, as small local edits (it's the file everyone touches):

- **A match host** beside today's map host: `matchHostId`, the same rule as `hostId`
  (`game.ts:889-891`) but over every player in the room, `elsewhere` included. Kills and scores
  (`hit`, `rs`, `sb`, `game.ts:546-549`) and passive mode (`game.ts:1214`) go to and come from the
  match host. Everything that's about one map (`ch`, `kt`, `bd`, `pk`, `pick`, `ldr`, vehicles,
  traffic, the canal, invasion, quests' world state) stays with the map host. When everyone is on
  one map the two are the same player, so today's game is unchanged.
- **Scores keep players elsewhere**: stop deleting them (`game.ts:1188`); the scoreboard shows
  which town each player is in.
- **Kills can't cross maps**: hits and train hits from players elsewhere are already dropped by
  `here()`; keep it that way.
- **Moving between maps**: when a player's `hello` says a different map from last time, add them
  to `elsewhere` (as now) or take them out of it (new), and drop or create their avatar.
- **The radio across maps**: in `onState` (`game.ts:1205`), for a player elsewhere, read only their
  talk mode and pass it to `voice.heard` with the nearby voice switched off for them; still ignore
  their position. Check `voice.ts` plays the radio without a position.
- Change the toast at `game.ts:1190` ("Start a new game to play together") to say where they've
  gone ("Ann has gone to Bradford-on-Avon").
- Keep the header comment at the top of `game.ts` true.

### Stage 5: changing map without leaving the game

The Game is built with one map and world (`main.ts:236`), and the street systems are built round
them. The least disturbing way to move is to **start a new Game on the new map with the same
connection**, carrying the player across:

- In `main.ts`, a `travel(toMap, at)` that fetches the map (`fetchMap`, already cached), builds its
  world, disposes the old Game and world, and constructs a new Game with the same `net`, name and
  code, plus what must carry over: `known`, `since`, `born` (so seniority and hosts don't reshuffle),
  the scores, the voice links (`Voice` is made inside the Game today, `game.ts:428`; pass one in
  instead so links aren't dropped), your weapon, health and score.
- The new Game starts you at `at` (the arrival platform, beside your carriage door) instead of the
  map's spawn.
- On arrival, the new Game says hello with its map, so everyone files you correctly.
- A normal game start goes down exactly the same path as today.

**Check (Mac, `kind: test`)**: two tabs with `?net=local`. Tab A travels to `bradford-on-avon` and
back with a debug key, without any train. Throughout: B stops seeing A while A is away, and sees A
again on return; the scoreboard keeps both; the host for each map is right in the debug panel
(`debugInfo`, `game.ts:896-899`); no errors. Muted headless Chrome per the rules.

### Stage 6: doors, boarding, the black screen and arriving

`web/src/railway.ts`:

- **Doors**: copy the cable car's door clock (`cableway.ts:271-280`): open 2 s into the dwell,
  chime and close a few seconds before it ends, door events within 40 m (`SFX.door` / `SFX.bell`,
  `game.ts:2365-2369`). Door leaves on the platform side of each carriage.
- **Each train's state**: stopped or not, which station, seconds of dwell left, and the stations
  still ahead, including the far end of a linked route.
- **Keep the ridden train alive** while you're on it (`railway.ts:348-358` removes trains out of
  range).

`web/src/game.ts`:

- **E boards**: in `useKey` (`game.ts:2860-2869`), before `useVehicle`: on a platform, near an open
  door of a dwelling train. The HUD shows where it's going and the time left ("Bradford-on-Avon
  train, doors close in 12 s"). If the train serves more than one destination you can reach,
  number keys pick one (a button in `touch.ts` on touch screens).
- **Riding**: seated in the carriage, carried with the train; others see you in their copy of the
  train through a new `st` extras field, e.g. `trn: [route, k, car, seat]`, drawn the way `cab` is
  for the cable car. No new message types. Riders aren't hit by trains (`trh`).
- **The black screen**: a full-screen black overlay with an opacity fade and a line of text
  ("Bath Spa to Bradford-on-Avon"), in `index.html` / `style.css`; not the menu's "Loading the map…".
  It fades in once the doors have shut and the train has pulled clear of the platform.
- **Arriving**: behind the black screen, `travel()` to the other map and wait for its squares
  round the platform (`world.hold`, as the menu does, `main.ts:141-157`; `hold()` pins squares for
  good, so add a way to let go). Fade up as the train draws in (decision 5 says when), stood on the
  platform beside your door, doors open, the train behind you.
- **Coming back**: the same prompt at Bradford-on-Avon offers Bath Spa (and Oldfield Park).
- Update `README.md` (getting on a train, Bradford-on-Avon) and the header comments of
  `railway.ts`, `game.ts` and `main.ts`.

**Check (Mac, `kind: test`)**: a scripted run in muted headless Chrome. Stand at Bath Spa with
`?at=`, wait for a Bradford-on-Avon train, press E and ride. Record doors opening and closing on
time, the fade, and arrival on the platform with the train behind. Then, with two tabs and
`?net=local`: one tab stays in Bath and keeps receiving the radio talk mode; a third tab catches a
later train and arrives in front of the first traveller. Then the return. Take shots of each moment.
Then a frame-rate probe in Bradford-on-Avon (`alone: yes`).

### Stage 7: to Spencer's repo

Only once Dan has checked the map (stage 2) and the travel (stage 6) on his fork and Spencer has
agreed the decisions: a `push` request with `push: spencer-main`, quoting Dan's approval message and
its id, fast-forward only.

## Decisions to settle with Spencer

1. **Places, not one big map**: each town its own map, all in one room (this plan).
2. **How big Bradford-on-Avon is**: field 1.2 km (town, station, Tithe Barn, Barton Farm; about 16
   squares) or 1.5 km (also towards Avoncliff and the Trowbridge road; about 19).
3. **Which stations offer the train**: Bath Spa and Bradford-on-Avon to start, Oldfield Park too
   (it's on the same trains).
4. **Can you start a game in Bradford-on-Avon**, or only arrive by train (hidden from the menu)?
5. **How long the black lasts**, as the ride is about ten minutes:
   - **Real time**: black for the ride, with a time to arrival; you step off the train you boarded,
     and it matches what anyone already in Bradford-on-Avon sees.
   - **Next train in** (recommended to start): a short black while the map loads, then you step off
     the next Bradford-on-Avon train due there. You wait at most one headway (400 s today; a
     shorter headway on this line shortens it). Others see you step off a real train, just not
     necessarily the one you boarded.
6. **What Bradford-on-Avon has**: everything the build gives every square (traffic, naughty boys,
   cats, pickups, buses, parked cars, pubs), and whether invasions can start there.
7. **The scoreboard**: one for the room (recommended, as the spec asked), showing which town each
   player is in.

## Risks

- **Bath changing by accident**: the new train routes rebuild Bath's squares; the byte-for-byte
  check in stage 3 is the guard, with `check_map` before and after.
- **`game.ts` conflicts**: everyone edits it. Keep the stage 4 and 6 changes small and local, and
  fetch Spencer's main just before merging.
- **Carrying state across a new Game**: anything left out (a carried ladder, a vehicle, a quest in
  progress) needs a rule. Simplest: get out of vehicles and drop what you're carrying before you
  board.
- **Clock skew**: players whose clocks differ by a few seconds disagree about when doors shut;
  boarding is decided on your own machine against your own smoothed clock, so it always feels right
  to you.
- **Repository size**: about +15-20 MB of squares plus Bradford-on-Avon's data folder. Each new town
  costs about the same, and nothing in Bath.
