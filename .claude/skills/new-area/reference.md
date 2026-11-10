# Reference: what the build does, what it costs, and publishing

For people and stronger agents. A weak agent following SKILL.md does not need this file, and must
not run the publishing commands here unless the user asks for publishing and a person agrees.

## What `new_area.py build` runs

In this order (`--dry-run` prints the exact commands). `build` uses the Python that `check` found,
and holds the machine's build lock (`~/.combedowner-build.lock`, shared with `tools/mac_build.sh`)
from the railway step to the end.

| Step | Tool | Where | Notes |
|---|---|---|---|
| download | `tools/fetch.py <id> data/raw/<id>/wide --only ...` | all | Overture's 8 layers, the canopy tile, OpenStreetMap (businesses, roads, detail, rail); in England also the lidar, census and conservation areas; in the UK the hygiene ratings. Never the energy certificates or parcels. |
| railway | `tools/railway.py` | all | before the squares, which cut the ground to the track; warns and carries on where there is none |
| church towers | `tools/towers.py` | England | needs the lidar |
| squares | `tools/prep_tiles.py ... --measure` | all | every full-detail square, one per core; writes `data/<id>/measured/` |
| wide map | `tools/prep_wide.py ... --measure` | all | the lighter whole-map file |
| lidar ground | `tools/lidar_ground.py` | England, once | the terrain tiles take the lidar's ground; then the railway, squares and wide map are built again. A marker, `data/raw/<id>/wide/terrain15/.lidar-ground`, stops it running twice |
| minimap ground | `tools/ground_kinds.py` | all | |
| pubs | `tools/pubs.py` | all | |
| district names | `tools/districts.py` | all | |

Speed limits (`tools/maxspeed.py`) come from the OpenStreetMap roads download and need no step.
The map's picture for the telemetry dashboard is sent by the game itself; nothing to do.
The partition (`tools/partition/`) builds every map's squares, a new one's too: `build` packs the
downloads into the map's layers (`tools/mapdata.py pack`) first, which the partition reads. Never set
`partition` in `tools/area.py` for a new map.

## Not automated, by design

- Energy certificates and OS Open UPRN (England and Wales): `docs/new-area.md`, "Energy certificates".
- HM Land Registry parcels: only the partition reads them.
- A canal (`tools/canal.py` needs a pack per map), moorings (`tools/moorings.py`), a cable car (`tools/cableway.py`).
- Zones, landmarks and set pieces: `docs/new-area.md` section 4.
- The sea level for a coastal map (`sea=` in `tools/area.py`, as Cape Town).

## One shape for every map

The co-developer's rule: the pack is self-sufficient and every map has the same format. The inputs vary; the
shape they are turned into does not.

- Every map's pack (`data/<id>/`) has the same common layers, whatever the source: ground heights,
  building and object heights, tree canopy, buildings, ways (streets, paths, railway), water, land
  use and cover, named places, and the optional extras (businesses, pubs, house types, old cores).
- Each source has its own step that converts it into that shape before packing: the EA's lidar,
  Wales's lidar, a city's or a country's own data abroad, and the worldwide fallbacks (Mapzen
  terrain, Meta / WRI canopy, Overture's and OpenStreetMap's heights and floor counts).
- The build reads only the common layers, never a source's own format.
- A pack rebuilds with no network: `tools/mapdata.py unpack <id>`, then the build without
  `--measure`, must give the same map offline.

For a weak agent the rule is one line: **fill every common layer; use the best source for the
place, else the fallback.** `new_area.py build` does this; adding a new source is a person's job.

Where today's tools fall short of it (2 November 2026):

- There is no written list of the common layers. Today the shape is whatever `tools/mapdata.py`
  happens to pack: Overture-shaped GeoJSON layers, terrain tiles (`terrain14.zip`, `terrain15.zip`,
  which carry the lidar's ground where `tools/lidar_ground.py` has run), and per-square
  `measured/<ti>_<tj>.zip` holding what the lidar and the canopy map said about each footprint
  and the canopy. Another branch (`claude/cape-town-citydata`) may propose the list.
- Building and object heights are only a layer where there is lidar: `measured/` holds per-footprint
  survey results, keyed by footprint, not a height surface. Without lidar, heights come from tags
  inside the building layer, so the "object heights" layer is missing rather than filled by a
  fallback.
- Some packed layers are UK formats, not common ones: `epc/` (energy certificate CSVs),
  `census.geojson` (TS044 counts), `conservation.geojson`, `parcels.geojson`, `listed.geojson`,
  `measured/towers.json` (lidar only), and `measured/partition.zip` (Bath only).
- Wales's lidar has no last returns, so its `measured/` lacks what the EA's last-return model
  gives; nothing fills that from a fallback.
- `tools/districts.py` reads OpenStreetMap live and is not packed, so district names need the
  network to rebuild.
- `new_area.py` does not pack (`mapdata.py pack` is a separate, publishing-time step), and nothing
  yet checks that a pack rebuilds offline to the same files.

## Open country (moorland, forest, reservoirs)

Nothing in the steps assumes a town. In open country:

- `verify` prints `INFO only N buildings`; it fails only if the squares have no buildings, roads
  or water at all.
- `shoot` takes the biggest way near the centre for its `road` view, down to a track or footpath,
  and leaves the view out if there is none. A view that would stand in a lake or reservoir (a map
  centred on one) moves south onto the shore. Players start on the roads and paths, as everywhere.
- Pubs, district names and the railway may come out empty: warnings, not failures.

What such a map lacks today (the Black Mountains round Grwyne Fawr Reservoir, for example):
moorland, heath and bracken are drawn as the ground kinds Overture's land cover gives (grass and
fields where it has nothing better) until the wilder ground types now being worked on land; the
dam is the lidar's ground shape, not a built wall; conifer plantations come from the canopy map as
ordinary trees; the Welsh lidar has no last returns, so the few buildings under trees are judged
from the canopy map alone; and there are no Welsh conservation areas or energy certificates.

## Wales's lidar, and the border

`tools/fetch.py` asks DataMapWales's WFS for the tiles of the Welsh Government LiDAR tile catalogue
2020-2023 (`geonode:welsh_government_lidar_tile_catalogue_2020_2023`, 1 km tiles in British
National Grid, 1 m, DTM and DSM, each tile's `dtm_link` and `dsm_link` a plain GeoTIFF on Azure
blob storage, nodata -9999, Open Government Licence), over the same box as the EA's squares, and
saves them as `lidar/dtm/wales-*.tif` and `lidar/dsm/wales-*.tif`. `tools/lidar.py` reads them
unchanged (any British National Grid GeoTIFF). The EA's squares are fetched as well: on the border
both apply, and where two surveys overlap a gap in one keeps the other's height. In Wales the EA's
"not found" for a square is taken as Welsh ground and passed over (in England it is still retried
and fatal). Wales has no last-return model; the EA's squares near the border do.

## Looking at one place

`python3 -I tools/square_at.py "<?at= value>" --map <id>` says which squares a view is in and prints
the command to rebuild just those. Shoot one view with
`cd web && npm run shoot -- "<east,north,bearing,tilt>" --map <id> --out ../shots/<id>` (note
`--map`: without it the tool shoots Bath).

On the build Mac, full builds can go through `tools/mac_build.sh <commit> --map --map-id <id> --check`.

## Publishing a map (only with the repository owner's say-so)

1. `python3 -I tools/mapdata.py pack <id> data/raw/<id>/wide` writes the compact copy to `data/<id>/`.
2. Write `data/<id>/README.md` with each source and licence: copy `data/bradford-on-avon/README.md`
   (England) or `data/cape-town/README.md` (outside the UK) and change the names and dates.
3. Commit `tools/area.py`, `web/src/maps.ts`, `data/<id>/` and `web/public/maps/<id>*`, never `data/raw/`.
4. Big maps go into the maintainer's `main` as one squashed pull request. Follow `CLAUDE.md`.

## Cost and size

Measured on a 14-core Mac (Apple M4 Max, 36 GB) on a home connection, 2 November 2026, with the
commands in SKILL.md, radius 600 m. Every radius up to 1450 m downloads the same 3.2 km data box
and builds the same 13 squares; the default 1500 m builds 21 squares from a 3.3 km box.

| | Norton St Philip, Somerset (England, lidar) | Monschau, Germany (worldwide data only) |
|---|---|---|
| Squares | 13 | 13 |
| Download (wall clock) | 434 s: Overture 3.5 min, 4 EA lidar squares (12 files), canopy, OSM, census, conservation, hygiene | 370 s: Overture, canopy, OSM (Overpass was down; the fallback API took longer) |
| Build (wall clock) | 102 s: railway 0, towers 1, squares 33, wide 11, lidar ground 25, squares again 27, wide again 3, the rest 2 | 80 s: squares 29, wide 13, districts 38 (network), the rest 0 |
| Processor time | 356 cpu-s in all (squares about 150 cpu-s per build) | 146 cpu-s |
| Largest single process | 4.1 GB (the download step) | 4.1 GB (the download step) |
| Raw downloads `data/raw/<id>` (never committed) | 1.28 GB (lidar about 0.9 GB, canopy 0.3 GB) | 0.64 GB (canopy 0.3 GB) |
| `data/<id>/measured` after the build | 2.0 MB | 2.5 MB |
| `data/<id>` after `mapdata.py pack` (what publishing commits) | 8.0 MB (packing took 34 s) | 5.6 MB (53 s) |
| Published `web/public/maps/<id>*` | 10.7 MB (2.0 MB gzipped) | 15.4 MB (3.5 MB gzipped) |
| Clash check | 73 rule failures, 6 per square | 383, 29 per square |
| Frame rate in the shots (menu backdrop, Mac GPU) | 55 fps lowest | 48 fps lowest |

Scaled to the default radius, 1500 m (21 squares, 6% more data box): downloads about the same
(7 to 8 minutes; England's lidar may add one or two 5 km squares, about 225 MB and a minute each);
the build about 1.6 times as long (3 minutes in England, 2 elsewhere, on 14 cores; by processor time, an
estimated 5 to 8 minutes on a 4-core laptop); published about 17 MB (3 MB gzipped) for a village, 25 MB (6 MB gzipped) for
a town; raw downloads 1.5 to 2.5 GB in England, under 1 GB elsewhere. Bigger radii grow with the
area: 3000 m is 45 squares. The first Frome build (900 m, 2026-10) took 25 minutes, nearly all
downloads, on a slower day for the servers.

A Welsh map's lidar (tested at Grwyne Fawr, radius 600 m, download only): 49 Welsh 1 km tiles plus
the EA's border squares that reach into the box, 395 MB, 2 minutes.

Price: nothing but the machine and the connection. Every source is free and needs no account
(the energy certificates, which do, are left out). As a cloud job it is about 10 to 15 vCPU-minutes
and 2 GB of scratch disk per small map.
