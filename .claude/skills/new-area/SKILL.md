---
name: new-area
description: Make a new Combe Downer map of any real place (a town, village or part of a city, in the UK or abroad), from a fresh checkout to playing it with ?map=<id>. Use when someone wants to play their own area, add a new map, or asks how to generate one.
---

# Make a new map

Follow these steps in order. Do exactly what each step says. Do not skip a step, do not reorder
steps, and do not run any command that is not written here or in a file this skill tells you to
read. When a step says STOP, stop and ask the user; do not try to fix it yourself.

Everything runs from the repository root (the folder holding `tools/` and `web/`). Run each command
exactly as written, replacing only the placeholders in angle brackets:

- `<name>`: the place exactly as the user gave it in Step 0 (e.g. `Lacock, Wiltshire`);
- `<title>`: the name the game shows: the chosen match's first line from Step 2, without the number and dot in front, up to its first
  comma (e.g. `Lacock`);
- `<id>`, `<radius>`: from Step 0; `<lat>`, `<lon>`: from Step 2.

## Hard rules (always)

1. Work on a branch or worktree, never on `main`. Step 1 checks this.
2. Never edit any file under `web/public/maps/` or `data/` by hand. The tools write them.
3. Never `git add` anything under `data/raw/`. It is ignored; leave it that way.
4. Never touch another map: not its entry in `tools/area.py` or `web/src/maps.ts`, not its files.
5. Run one build at a time. `new_area.py` waits for the machine's build lock by itself: if it prints
   `waiting for another build to finish`, let it wait. Do not delete the lock.
6. Every browser run is headless and muted. Use only `new_area.py shoot` (it uses `tools/shoot.mjs`,
   which mutes everything). Never open the game in a browser any other way, never play audio.
7. Do not `git commit` or `git push` unless the user tells you to.
8. Never edit `tools/*.py` other than through the commands here. A map that builds badly is
   reported to the user, not fixed in the tools.
9. Every map has the same common layers (ground heights, building and object heights, tree canopy,
   buildings, ways, water, land use, places), whatever the place. `build` fills every layer with
   the best source for the place, else the worldwide fallback. You never choose sources and never
   leave a layer out. If a step asks you to add a source by hand, STOP: that is work for a person
   (`reference.md`, "One shape for every map").

## STOP list: stop and ask the user when

- `check` prints `CHECK FAIL` and the fix it prints did not make it pass on the second try.
- `find` prints no match, or none of its matches is the place the user means.
- `add` prints `FAIL ... has changed shape`.
- `build` prints `BUILD FAIL` and `troubleshooting.md` has no row for the error, or its fix failed once.
- `verify` prints `VERIFY FAIL`, or `FAIL git sees changes only to this map's files`.
- `shoot` prints `SHOOT FAIL` twice in a row.
- The user asks for something not in this skill: landmarks, a canal, a cable car, zones, Land
  Registry parcels, energy certificates, publishing to the live game. Tell them it needs a person
  (or a stronger agent) and point them at `docs/new-area.md`.
- Anything prints `Traceback` and `troubleshooting.md` has no row for it.

## Step 0. Ask the user (one message, all four questions)

Ask exactly these, with these defaults:

1. **Place**: "Which place? A name is enough (a pub, green or church in the middle is better than a
   town's name), or the coordinates of the middle as latitude, longitude." (no default: you must
   have an answer)
2. **Radius**: "How big, as a radius in metres? 600 is a village, 1500 a small town (default 1500,
   allowed 400 to 4000)."
3. **Map id**: "A short id for the address, lower case with dashes (default: the place name in lower
   case with dashes, e.g. `norton-st-philip`)."
4. **Menu**: "Should it show in the game's map menu, or only at `?map=<id>`? (default: only at
   `?map=<id>`)."

Write down the answers. If the user gives no answer to 2, 3 or 4, use the default.

## Step 1. Pre-flight (about 10 seconds)

```sh
git rev-parse --abbrev-ref HEAD
```

IF it prints `main` or `master`: run `git switch -c claude/map-<id>` (with the map id from Step 0).

```sh
python3 -I tools/new_area.py check
```

Success: the last line is exactly `CHECK PASS`, and every line above it starts with `PASS`.

| IF a line says | THEN |
|---|---|
| `FAIL python packages: missing ...` | Run the command printed after `->` (it makes `~/.venvs/combedowner`). Then run `check` again. `new_area.py` finds that Python by itself. |
| `FAIL web/node_modules ...` | Run `cd web && npm install && cd ..`, then `check` again. |
| `FAIL git branch is main` | Run `git switch -c claude/map-<id>`, then `check` again. |
| `FAIL node ...`, `FAIL Google Chrome ...`, `FAIL python 3...` | STOP: the user must install it. |
| `FAIL ... GB free on disk` | STOP: tell the user how much is free. |
| `FAIL network ...` | Wait one minute, run `check` again. Still failing: STOP. |

## Step 2. Find the place (a few seconds)

```sh
python3 -I tools/new_area.py find "<name>"
```

If the user gave coordinates, run `find "<lat>, <lon>"` with them instead. It prints the named place
nearest them: take its `BRANCH:`, and for `<title>` ask the user what the game should call the map
(default: that match's first part). Keep the user's own `<lat>` and `<lon>` for every later step, not
the match's. Skip the rest of this step and go to Step 3.

If it prints `FAIL no place found`, follow that row of `troubleshooting.md` (a shorter name) before
anything else.

It prints up to five numbered matches, each with a `kind:`, `region:`, `BRANCH:` and a
`--lat ... --lon ...` line. Pick the match:

1. Keep only matches whose first line names the place and county or country the user meant.
2. Of those, prefer a `kind:` of `place/...` (village, town, suburb) over `boundary/administrative`.
   A lake, reservoir, hill or other feature the user named is a fine centre: its `kind:` is
   `water/...` or `natural/...`, and that is the match to keep.
3. If more than one is left, take the lowest number.
4. If none is left: STOP and show the user the list.

Show the user the chosen match's first line and ask "Is this the right place?". If no: STOP and
ask them for a better name or a pub/church in the middle, then repeat Step 2.

Copy the chosen match's `--lat <lat> --lon <lon>` and its `BRANCH:` (`UK` or `NON-UK`).

## Step 3. Pick the branch

The test is the `BRANCH:` from Step 2, nothing else.

- `BRANCH: UK` (region starts `GB-`): read `.claude/skills/new-area/uk.md` now, then come back
  to Step 4.
- `BRANCH: NON-UK`: read `.claude/skills/new-area/non-uk.md` now, then come back to Step 4.

Both branches use the same commands below; the file you read tells you what the map will have and
lack, and which credits it needs.

## Step 4. Register the map (about 5 seconds)

Without the menu (the default):

```sh
python3 -I tools/new_area.py add "<title>" --id <id> --radius <radius> --lat <lat> --lon <lon>
```

If the user said yes to the menu in Step 0, add ` --in-menu` to the end of that command.

Success: the output ends with these three lines:

```
BRANCH: <the same as Step 2>
ADDED <id>: tools/area.py and web/src/maps.ts
next: python3 -I tools/new_area.py build <id>
```

| IF it prints | THEN |
|---|---|
| `FAIL '<id>' is already in tools/area.py` | Ask the user for a different id. Repeat Step 4 with it. |
| `FAIL --id ...` | The id has a bad character. Make it lower case letters, digits and single dashes. Repeat. |
| `FAIL --radius ...` | Use a radius from 400 to 4000. Repeat. |
| `FAIL ... has changed shape` | STOP. |
| The `BRANCH:` differs from Step 2 | STOP. |

## Step 5. Download and build (10 to 40 minutes)

```sh
python3 -I tools/new_area.py build <id>
```

This runs a long time. Run it in the background if your tool allows it, and wait for it to exit;
do not start any other step meanwhile. It prints `== <step>` before each step and
`STEP <step>: ok in Ns ...` after it.

Success: the output ends with

```
TIMES download <N>s, build <N>s, on <N> cores
BUILD OK <id>
next: python3 -I tools/new_area.py verify <id>
```

`WARN step railway failed`, `WARN step pubs failed` and `WARN step district names failed` are
allowed: the map builds without them. Note them for the final report.

IF it prints `BUILD FAIL`: read `.claude/skills/new-area/troubleshooting.md` now, find the row
whose error text matches, and do what it says. A build that stops can be rerun with the same
command: downloads already done are kept, and squares already built are not built again.

## Step 6. Verify (about 1 minute)

```sh
python3 -I tools/new_area.py verify <id>
```

Success: the last line is `VERIFY PASS`. Lines starting `WARN` are allowed; note them.

The clash check lines (`rule failures across N map files:` and the counts under it) are for the
report. Acceptable: the line `PASS clash check: ... per square (150 or fewer)`. A `WARN clash check`
line: still carry on, but tell the user in the report.

Copy the three `SIZE` lines for the report.

IF `VERIFY FAIL`: read `troubleshooting.md`, find the `FAIL` line in it, and do what it says. If it
is not there: STOP.

## Step 7. Screenshots and frame rate (1 to 3 minutes)

```sh
python3 -I tools/new_area.py shoot <id>
```

It picks the views by itself, builds the game and shoots them in a muted headless Chrome:
`centre` (eye height), `centre-air` (from 90 m up), `road` (the biggest road near the centre,
looking along it: a main street in a town, a lane or track in open country; left out if there is
no road) and `edge` (near the edge of the play area, looking in). A view that would stand in a lake
or reservoir is moved onto its southern shore. You do not choose views.

Success: the last lines are `SHOOT PASS` and `look at each picture: shots/<id>/*.png`, and one line
reads `audio: ... context=Silent`. If that line says `context=REAL`: STOP.

Then look at each of the four pictures (open them with your file-reading tool). For each, write one
line: what you see. Any of these is a problem to report (not to fix):

- the picture is all one colour, or all sky, or all fog;
- buildings float in the air or are sunk to their roofs;
- the ground is flat blue water where there should be land (the height `z0` is wrong);
- no buildings at all in `centre-air`, but only if `verify` did not print `INFO only N buildings`
  (open country, moorland or forest has few or none, and that is fine).

The `frame rate:` line: `PASS` is 20 fps or more. `WARN` means slow on this machine; report it.

IF `SHOOT FAIL`: read `troubleshooting.md`, find the `FAIL` line in it, and do what it says.

## Step 8. Report to the user

Write the report in this shape, filling in from what the commands printed:

```
Your map of <title> is built: id <id>, radius <radius> m, <N> squares.

Play it: cd web && npm run dev, then open http://localhost:5173/?map=<id>
(Shift+F3 in the game copies a link to where you stand.)

What it has: <England: real roofs, heights, church towers and ground from the lidar, the census's
house types, conservation areas, pubs with hygiene ratings. Wales: the same lidar from the Welsh
Government, the census's house types, hygiene ratings. Elsewhere: buildings, roads, water, trees
and terrain from worldwide open data>.
What it lacks: <copy the "will be built without" list that add printed, plus any WARN step>.
Clash check: <total> rule failures over <N> squares (<per> per square).
Frame rate in the screenshots: lowest <N> fps.
Screenshots: shots/<id>/ (centre, centre-air, road, edge): <one line each>.
Sizes: <the three SIZE lines>.

Nothing is committed. The new files are web/public/maps/<id>*, data/<id>/, and the edits to
tools/area.py and web/src/maps.ts.
Next, if you want them: landmarks (the church, the pub), or publishing it to the live game. Both
need a person or a stronger agent: see docs/new-area.md.
```

## Step 9. Only if the user asks: undo it

```sh
python3 -I tools/new_area.py remove <id>
```

Success: it ends `REMOVED <id>`. It refuses any map already committed to the repository.

## Files beside this one

- `uk.md`: UK sources, what England, Wales, Scotland and Northern Ireland each get, licences and credits.
- `non-uk.md`: worldwide sources, what a map outside the UK lacks, licences and credits.
- `troubleshooting.md`: every known error, as IF/THEN tables.
- `reference.md`: what each build step does, cost and size, and how a map is published (for people
  and stronger agents only).
