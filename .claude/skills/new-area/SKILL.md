---
name: new-area
description: Add and build a map of your own area in England for Combe Downer, from a fresh checkout to playing it with ?map=<id>. Use when someone wants to play their own town, street or village, add a new map, or asks how to generate an area.
---

# Make a map of your own area

Only **England** builds: roofs are measured from the Environment Agency's lidar, which is
England's only (the lidar loader is also fixed to British National Grid, and `tools/fetch.py` only
knows the Agency's tiles). Wales, Scotland and anywhere abroad do not work. Say so at once if the
place is not in England. `docs/own-area.md` has the background and what is hard.

Run everything from the repository root, in your own branch or worktree (the build edits
`tools/area.py` and `web/src/maps.ts`, which other people edit too). Measured on Frome (radius
900 m): about 25 minutes the first time, nearly all of it downloads; a rebuild takes a minute or two.

## 1. Ask

Only what changes the build:

1. **Place.** A name is enough, but a pub or green in the middle beats a town's official centre
   (`--lat/--lon`). The centre can never change afterwards.
2. **Radius** of the play area in metres: 800 to 2000 is sensible (default 1500). The detailed
   middle is always about 3.1 km across.
3. **Map id**, lower case with dashes (default: the name).

## 2. Install (once)

```sh
pip3 install numpy shapely pillow scipy scikit-image rasterio overturemaps
cd web && npm install && cd ..
```

Python 3.13 and Node 22 are what CI uses. Chrome is needed only for screenshots. If rasterio
will not install it wants GDAL (`brew install gdal`). `new_area.py build` checks the packages
and says which are missing. Tools are run as `python3 -I tools/<name>.py`.

## 3. Register

```sh
python3 -I tools/new_area.py add "Frome" --id frome --radius 900
```

Optional: `--lat N --lon N` (skip the lookup), `--zone suburb`. It prints the place it found:
**check it is right**. It refuses places outside England, writes the entry into `MAPS` in
`tools/area.py` and the menu line into `web/src/maps.ts`, and sets `z0` (the ground height at the
centre) from the terrain tiles. Edit the entry afterwards only if you want to:

- `zones=[("georgian", east, north, radius), ...]` and `default_zone`: how houses look where the
  data is silent. Zone names are at the top of `tools/buildings.py`: `suburb` (default),
  `london`, and Bath's `georgian`, `victorian`, `riverside`, `bath`. An unknown name gets plain guesses.
- `spawn="Name of a green"` (a park's name in the map data) so everyone starts there.

## 4. Download and build

```sh
python3 -I tools/new_area.py build frome            # --dry-run prints the steps only
```

It runs, in order (so you can rerun any one):

| Step | Command | Measured (Frome) |
|---|---|---|
| Downloads | `python3 -I tools/fetch.py frome data/raw/frome/wide --only overture,canopy,osm,lidar,fsa` | about 25 min: eight Overture layers (a few seconds to 3 min each), the 290 MB canopy tile, OpenStreetMap, five 5 km lidar squares x3 |
| Squares | `python3 -I tools/prep_tiles.py frome data/raw/frome/wide web/public/maps/frome --measure` | 13 squares, 76 s on 14 cores; also downloads terrain |
| Whole-area file | `python3 -I tools/prep_wide.py frome data/raw/frome/wide web/public/maps/frome-wide.json --measure` | seconds |
| Minimap ground | `python3 -I tools/ground_kinds.py frome` | seconds |
| Pubs | `python3 -I tools/pubs.py frome data/raw/frome/wide web/public/maps/frome-pubs.json` | seconds |
| Check | `python3 -I tools/check_map.py frome` | seconds; counts rule breaks per square |

Downloads skip files already there, and a download that dies leaves only a `.part` file, so
just run `build` again. `prep_tiles.py` rebuilds only squares whose data or tools changed
(`--force` for all, `--only 1,1 0,2` for some). A square failing with "No module named ..." means a
package is missing: install it and rerun. The first `--measure` run writes what it measured to
`data/frome/measured/`.

Not automated, all optional: energy certificates (wall materials; they need an account, see
`docs/new-area.md`, files go in `data/raw/frome/wide/epc/`), the railway
(`python3 -I tools/railway.py frome data/raw/frome/wide web/public/maps/frome-rail.json`, run
before `prep_tiles.py`), canals (a hand-written pack), landmarks (section 6 below).

## 5. Play and look

```sh
cd web && npm run dev          # then http://localhost:5173/?map=frome
cd web && npm run shoot -- "0,0,90,-5" "300,-200,330,-15,60" --map frome --out ../shots/frome
```

A view is `east,north,bearing,tilt[,height]` in metres from the centre. Shift+F3 in the game copies
the link for where you stand. Look for floating buildings, roads through houses, flooded valleys
(wrong `z0`) and blank ground (a layer failed). Shots are not for committing (`shots/` is
ignored). `check_map.py` lists the worst places as data coordinates: some are faults in the data,
so judge rather than chase zero. A 404 for an optional file (`-rail.json`, `-canal.json`) in the
shoot report is normal.

## 6. Make it yours: local landmarks

The build draws everything from open data, so a church comes out as plain blocks and a spire,
portico or ornamental bridge isn't there at all. Hand-made landmarks are what make a map feel like
the real place, and Claude is good at making them: once the map plays, ask the user which places
matter to them (the church, the pub, the bridge, the school, the local ground) and build them, one
at a time, from what they describe and photos of the real thing.

Two ways in, both modelled from primitives in code (no asset files; `kit.ts` has the parts):

- **A set piece** (`SET_PIECES` in `web/src/landmarks/setpieces.ts`): a detailed model that hides
  whatever the build put inside its outline, so nothing needs rebuilding. The usual choice for a
  particular building; Bath Abbey, the Roman Baths and Pulteney Bridge are examples.
- **A landmark pack** (`tools/landmarks/<map id>.py`, `-` written `_`; `bath.py` is the example,
  `__init__.py` documents it) places things the build should know about, using a builder in
  `web/src/landmarks/` (an existing one like `spire.ts` or `bridge.ts`, or a new one). Find the
  building by name (`from landmarks import named`), not typed coordinates, and rebuild just its
  squares (`python3 -I tools/square_at.py "<?at= value>" --map <id>` prints the command).

Check each one with `npm run shoot` from where people would stand. `docs/new-area.md` section 4 has
the details.

## 7. Keep it

`web/public/maps/frome*`, `data/frome/` and your two edits are not git-ignored: do not commit
them by accident. To publish the map, first
`python3 -I tools/mapdata.py pack frome data/raw/frome/wide`, write `data/frome/README.md` with each
source and licence as the other maps do, then follow `CLAUDE.md`'s workflow. Only with the
repository owner's say-so.
