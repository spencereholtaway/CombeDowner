# Making a map of a new area

Every map is built from open data by `tools/prep_map.py`. The build is generic: point it at a new
place, download the data for it, and it works out the buildings, roofs, walls, trees, roads and
terrain. Some data is optional. The map still builds without it, just with more guessing.

| Data | What it gives | Needed? | Coverage |
|---|---|---|---|
| Overture Maps | footprints, roads, paths, walls, water, woods, place names | yes | worldwide |
| Mapzen terrain tiles | ground height | yes (downloaded by the build) | worldwide |
| Environment Agency lidar | real building heights, roof shapes, parts at different levels, tree heights | strongly recommended | England |
| Meta / WRI canopy height | tree positions, hedges, shrubs | recommended | worldwide |
| Energy certificates (EPC) and OS Open UPRN | wall materials, bungalows, business premises | optional | England and Wales |
| OpenStreetMap | shops, pubs, cafés and offices, on the right building | recommended | worldwide |
| Food Standards Agency ratings | pubs, cafés and takeaways OpenStreetMap is missing | optional | England, Wales, NI |
| A landmark pack | hand-made landmarks (spires, porticos, bridges) | optional | per map |

`tools/new_area.py` does the registering and the build in order for an ordinary area, and the
`new-area` skill (`.claude/skills/new-area/`) walks through it; `docs/own-area.md` says what a script
cannot do for you.

All raw data goes in `data/raw/<map id>/`, which git ignores. For a map with a wide area, a copy of
what the build reads from it, small enough to keep, then goes in the repository, in `data/<map id>/`
(`tools/mapdata.py pack`, after building with `--measure`): from then on anyone can rebuild the
map from that with `tools/mapdata.py unpack` and no downloads (see "Rebuild a map" in README.md).
`tools/fetch.py` downloads everything below but the energy certificates in one go.

## 1. Add the area

In `tools/area.py`, add an entry to `MAPS`:

```python
"my-place": dict(
    name="My Place",
    centre=(-2.3452, 51.3624),   # lon, lat of the middle of the map
    field=1000,                  # force field radius in metres (the play area)
    field_centre=(0, 0),         # optional: the force field's centre, metres east and north of centre
    half=1100,                   # metres of data from the field's centre to each edge (a bit more than field)
    zones=[("village", 0, 0, 300)],   # local character areas: (zone, x east, y north, radius), metres from the centre
    default_zone="suburb",
),
```

`centre` is the origin of every coordinate in the map, so keep it fixed once anything (a landmark,
the mines' front door) is placed by coordinates. To grow the play area, make `field` bigger and
move `field_centre` instead: the data box follows the field.

Zones set the guesses used where the data is silent (what walls are made of, roof styles, storey
heights). The zone names and what each means are listed at the top of `tools/buildings.py`.
Where lidar and EPC data are present, they override the guesses.

Then add the map to `MAPS` in `web/src/maps.ts` so it appears in the menu.

## 2. Download the data

Set the map id once:

```sh
MAP=my-place
mkdir -p data/raw/$MAP
pip3 install overturemaps rasterio scipy scikit-image
```

### Overture Maps (required)

```sh
cd data/raw/$MAP
for t in building segment water land_use land land_cover infrastructure place; do
  python3 -I ../../../tools/download.py $MAP $t $t.geojson
done
cd ../../..
```

### Environment Agency lidar (England)

From https://environment.data.gov.uk/survey, download for every OS 5 km square the map
touches (the map is `2 × half` metres across, so usually two to four squares):

- **LIDAR Composite DTM, 1 m** (bare ground)
- **LIDAR Composite First Return DSM, 1 m** (ground plus buildings and trees)
- **LIDAR Composite Last Return DSM, 1 m** (the same, through the leaves: where it differs from
  the first returns, a tree stands over what's below, so a roof there can't be measured)

Unzip the GeoTIFFs into:

```
data/raw/my-place/lidar/dtm/*.tif
data/raw/my-place/lidar/dsm/*.tif
data/raw/my-place/lidar/last/*.tif
```

To find the squares, open the map's centre on the survey site, or convert it to British National
Grid: Combe Down is in ST76SE and ST76SW.

The squares can also be fetched without the website: each one is a plain download, named by the
square's south-west corner in kilometres (ST76SE is ST7560, ST76NW is ST7065):

```sh
curl -L -o ST7560-dtm.zip https://environment.data.gov.uk/tiles/collections/survey/lidar_composite_dtm/2022/1/ST7560
curl -L -o ST7560-dsm.zip https://environment.data.gov.uk/tiles/collections/survey/lidar_composite_first_return_dsm/2022/1/ST7560
curl -L -o ST7560-last.zip https://environment.data.gov.uk/tiles/collections/survey/lidar_composite_last_return_dsm/2022/1/ST7560
```

The whole of Bath round Combe Down (the squares, `prep_tiles.py`) needs ST65NE, ST66NE, ST66SE,
ST75NE, ST75NW, ST76NE, ST76NW, ST76SE, ST76SW, ST77SE, ST77SW, ST86NW and ST86SW, unzipped into
`data/raw/<map>/wide/lidar/dtm/`, `dsm/` and `last/` (a link to the detailed map's `lidar` folder will do).
Each square reads only the lidar tiles it stands on.

### Meta / WRI tree canopy

One zoom-9 tile covers the map. Work out its quadkey and download it:

```sh
python3 -c "
import math; lon, lat = -2.3452, 51.3624     # the map's centre
z = 9; n = 2 ** z
x = int((lon + 180) / 360 * n); y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
print(''.join(str(((x >> i) & 1) + 2 * ((y >> i) & 1)) for i in range(z - 1, -1, -1)))"
mkdir -p data/raw/$MAP/canopy
curl -o data/raw/$MAP/canopy/<quadkey>.tif \
  https://dataforgood-fb-data.s3.amazonaws.com/forests/v1/alsgedi_global_v6_float/chm/<quadkey>.tif
```

With lidar present, tree heights come from the lidar and this tile only fills in low growth such
as hedges and shrubs.

### HM Land Registry parcels (optional)

The registered freehold extents (INSPIRE Index Polygons) are what the partition build draws real
plot boundaries from; without them it falls back to dividing blocks by rule, so this download is
optional. One zip covers a whole local authority and does not need the sign-in the site asks for:

```sh
curl -L -o banes.zip \
  https://use-land-property-data.service.gov.uk/datasets/inspire/download/Bath_and_North_East_Somerset_Council.zip
python3 -I tools/parcels.py $MAP banes.zip data/raw/$MAP/wide/parcels.geojson wide
```

The council's name is in the link on the download page; the file inside the zip is
`Land_Registry_Cadastral_Parcels.gml`. The conversion needs `pyproj` (`pip3 install pyproj`) and
its OSTN15 grid, which returns the 1 m transformation: run it once with the network on, or drop
`uk_os_OSTN15_NTv2_OSGBtoETRS.tif` from cdn.proj.org into PROJ's share/proj directory, or every
boundary will be about 0.4 m out. Licence: Open Government Licence v3, with the two attributions
in `data/combe-down/README.md`.

### Energy certificates (England and Wales)

1. Sign up at https://get-energy-performance-data.communities.gov.uk and download the
   **Domestic** certificates for the local authority as CSV. Save it as
   `data/raw/my-place/epc/certificates.csv`.
2. Download **OS Open UPRN** (CSV) from https://osdatahub.os.uk/downloads/open/OpenUPRN. It
   covers all of Great Britain and is too big to keep, so cut it to a box around the area
   (south, north, west and east edges in degrees):

   ```sh
   unzip -p osopenuprn_*.zip '*.csv' \
     | awk -F, 'NR==1 || ($4>51.27 && $4<51.45 && $5>-2.70 && $5<-2.18)' \
     > data/raw/$MAP/epc/uprn.csv
   ```

   For shop signs, also download the **Non-domestic** certificates for the same authority and
   save them as `data/raw/my-place/epc/non-domestic.csv`.

### OpenStreetMap businesses (recommended)

```sh
python3 -I tools/osm.py $MAP data/raw/$MAP/osm.geojson
```

This fetches every shop, amenity, office, craft and named building in the map's box. It tries
the Overpass API first and falls back on the main OpenStreetMap API in tiles, so it works on
networks that block Overpass. Without it, shop signs come from Overture's places, which are often
a few doors off.

### Food hygiene ratings (optional)

```sh
python3 -I tools/fsa.py $MAP data/raw/$MAP/fsa.geojson
```

## 3. Build the map

```sh
python3 -I tools/prep_map.py $MAP data/raw/$MAP web/public/maps/$MAP.json
```

The build prints what it found, for example:

```
split buildings: 49 more parts where roof levels change
lidar: measured 2207 of 2682 buildings (247 flat, 284 hipped)
epc: 2263 addresses, 1324 buildings, 398 with a known wall, 100 bungalows
canopy: tree heights from lidar
shops: 32 businesses (29 osm, 2 fsa, 1 overture)
```

A "no lidar data", "no canopy data" or "no EPC data" line means that data wasn't found where
expected. Check the folder names above.

Try it with `cd web && npm run dev`, then pick the map in the menu.

### A wider circle round it (optional)

A map can have a much bigger, simpler circle round it: Combe Down sits inside the whole of Bath.
Give its entry in `tools/area.py` a `wide` setting (the bigger force field, its centre and data
radius, and zones for the wider area), download the Overture layers into `data/raw/<map>/wide/`
with `wide` on the end of each `download.py` command, put the canopy tile in
`data/raw/<map>/wide/canopy/`, and build it after the detailed map:

```sh
python3 -I tools/prep_wide.py $MAP data/raw/$MAP/wide web/public/maps/$MAP-wide.json
```

It keeps the terrain on a 12 m grid lined up with the detailed map's, every building (guessed at
by the same rules, without lidar or energy certificates), roads with their bridges, water, named
places and every tree in the canopy map, cut into squares the game streams in round the player
(`web/src/wide.ts`, `web/src/outskirts.ts`). Then set `wide: true` on the map in `web/src/maps.ts`.

### The wider circle in full detail, as tiles (optional)

The same wide data can also be built at the detailed map's own level of detail (gardens, walls,
doors, street furniture, parked cars, shop signs, shrubs), cut into squares a little over a
kilometre across that the game streams in. The detailed map is then built this way too: it is
the middle 3 x 3 squares, built and loaded like the rest, so the whole map comes out of one build
path and the game treats every square the same. Build the canal and the
railways (below) first if the map has them, as the squares cut the ground under the track and the
canal to the levels those files give; then:

```sh
python3 -I tools/prep_tiles.py $MAP data/raw/$MAP/wide web/public/maps/$MAP
```

For Combe Down's Bath, that same command then lays the ground out as a partition
(`tools/partition/stage.py`, "Rebuild a map" in the README). It runs for a map marked
`partition=True` in `tools/area.py`; a new map doesn't have it, and is built by `prep_map.py` alone.
To give one the partition it needs the Land Registry's parcels (below) and the lidar, then a build,
then `tools/mapdata.py pack`, which keeps what the partition reads from the lidar
(`data/$MAP/measured/partition.zip`); `tools/partition/` still reads `CD_MAP` for its map, and has
only been tried on Bath.

For the squares' shop signs, download OpenStreetMap and the food hygiene ratings for the wide
circle first (`python3 -I tools/osm.py $MAP data/raw/$MAP/wide/osm.geojson wide`, and the same with
`tools/fsa.py` and `fsa.geojson`), and put the non-domestic certificates and the UPRN file in
`data/raw/$MAP/wide/epc/`. Without them the squares fall back on Overture's places, which are often a
few doors off.

For the streets' widths and pavements, download OpenStreetMap's streets too
(`python3 -I tools/osm.py $MAP data/raw/$MAP/wide/osm-roads.geojson wide roads`): where a street
is tagged with its width, lanes or pavements ("sidewalk"), the squares use them, and the lidar
narrows streets to the walls either side (see `tools/roadwidth.py`). Without it the lidar alone
decides.

Each tile is an ordinary map file, `web/public/maps/<map>/<ti>_<tj>.json`, built by
`prep_map.py --tile ti tj` (one tile on its own:
`python3 -I tools/prep_map.py $MAP data/raw/$MAP/wide out.json --tile 0 3`). The tiles lie on
one terrain grid, 261 cells to a side, with tile (0, 0) at the south-west corner of the detailed
area's box (`field_centre` and `half` in `tools/area.py`; `z0` there is the height every tile's
terrain is measured from). Tiles 0 to 2 each way are the detailed area, in with the rest;
`web/public/maps/<map>.json` holds only what belongs to the map as a whole (its name, centre, force
field, base height and where everyone starts), and `tools/stitch.py` joins the nine into one file
for the single-file build. `tiles.json` beside the rest gives the grid's corner, spacing, cells per tile, `z0` and the list of tiles the game streams
in. Every tile reaching into the wide data circle is built; about 130 of them for Bath, around 25
seconds each, one for each of the machine's cores at a time.

So that the squares meet cleanly, each tile is worked out over a 60 m margin (roads half a
kilometre further) and keeps only its own share: buildings whole, in the tile holding the middle
of the footprint; anything standing at a point, in the tile it stands in; roads, walls and streams
cut at the edge; terrain edges shared exactly.
The random choices (a house's roof, where its door goes, which side the telegraph poles run) come
from where each thing stands, so two tiles building the same street near their shared edge agree.

Each tile's roads rise and fall smoothly (their heights are averaged over a few points each way,
pinned where roads meet and left as they are on bridges and in tunnels), the ground is flattened
under them and eased back to its own level over a slope, not a step, and is left alone under a
bridge's span, which is marked with a fourth value of 1 on the road's points for the game to build
a deck, parapets, abutments, piers and arches for. The bridges follow a few rules, because the
data alone makes a mess of them: a deck's ends come from where the road stops dropping into the
gap (the survey's ground under a bridge is the gap filled in), and the approach is held level; a
marked span counts as a bridge only if it crosses water, the railway, a road it doesn't join (roads
that meet are a junction, never one over the other) with the deck well above it or a span long
enough to be a bridge, or the ground drops well away under it, and otherwise it's flattened into
the road; a path running along a road's span rides on its deck (a fourth value of 2: the road's
height, nothing built of its own); a road crossing under a road's bridge is dipped to leave
headroom; and a tunnel stretch too shallow to bore is an underpass, with whatever crosses it
carried over as a bridge. Streets closed to motor vehicles are pedestrian streets (no traffic, no
parked cars), and one-way streets say which way (`ow`). Every road or path crossing the canal is
a bridge with headroom for a boat, the canal's own pieces of water are tagged `c: "canal"` (the
game draws the canal's water itself) and its bed is dug only as wide as its water, water never
digs out a road's flattened ground, and the corridors are kept clear: nothing stands in a road's
carriageway, on the railway, in the water or in the canal's channel (trees, shrubs and street
items there are taken out, and walls are cut where they cross any of them).

`python3 -I tools/check_map.py <map>` checks every built square (and the detailed map) against
these rules and lists the worst places each is broken, as data coordinates to go and look at in
the game. Run it after a rebuild: a rule that fails somewhere is fixed in the tools, not by hand.
Once the game is built (`cd web && npm run build`), rule 20 also looks down on every street as the
game draws it (`node tools/overroad.mjs`, which runs on its own too, `--only "ti,tj ..."` for some
squares) and counts, in square metres, what is drawn over a carriageway or a pavement that
shouldn't be, and pavements standing on a lip; `CD_OVERROAD=0` leaves it out. River banks slope down to the water over ten
metres (`bk` in the file says so, and the game does the same at load time for a map built
without it); the canal's bed and banks follow its own levels, and the ground is flattened under
the railway. The first run cuts the wide layers into what each tile needs (`data/raw/<map>/wide/split/`) and
keeps the terrain downloads in `data/raw/<map>/wide/terrain15/`. After that, a square is only built
again when something it's built from has changed (its share of the layers, the lidar, canopy,
terrain or certificates, the canal and railway files, or any of the map tools), so a second run
with nothing changed takes seconds. Add `--force` to rebuild every square anyway, or
`--only 0,3 -1,3` to look at just those. The lidar we have doesn't cover every square (north Bath has none), so to rebuild squares
already built from a fuller download, add `--keep`: wherever this build's lidar can't see a building,
it is split and measured as the earlier build had it. With no lidar,
energy certificates or OpenStreetMap download for the wide area, buildings are guessed at from
the zones in `tools/area.py` (one list for the whole map), and shop names come from Overture's
places. Hand-made landmarks for every tile go in the map's one pack (`landmarks` in
`tools/area.py`: `tools/landmarks/bath.py` for Bath); a landmark found by name should check it's
found the right building, as the same name can turn up across a city. To put a new
landmark into squares already built without rebuilding them, run
`python3 -I tools/place_landmarks.py <map> web/public/maps/<map> ti,tj ...` on the squares it
stands in. Pitches are marked out by their OpenStreetMap sport tag; to redo them on squares already
built, from the wide `land_use.geojson`, run `python3 -I tools/pitches.py <map> data/raw/<map>/wide
web/public/maps/<map> --tiles`.

### The canal and the railways (optional)

A canal and its locks, and the railways and their trains, are laid out from the same wide layers
(water, segment and infrastructure), after the detailed map and before the tiles:

```sh
python3 -I tools/canal.py $MAP data/raw/$MAP/wide web/public/maps/$MAP-canal.json
python3 -I tools/railway.py $MAP data/raw/$MAP/wide web/public/maps/$MAP-rail.json
```

Overture doesn't mark locks or which level each stretch of canal is at, so `tools/canal.py` has a
pack for each map: one point on the canal with its water level, each lock by where its lower and
upper gates are and how far it lifts a boat, and each tunnel by its portals. Every other stretch's
level follows through the locks, and it prints the lowest bank beside each stretch, which should
sit just above that stretch's water. Aqueducts are found from the ground dropping away under the
water. The railway needs no pack: it takes the working lines, their bridges and tunnels, the
stations and platforms, and works out the routes the trains run, keeping left. It lays the track
level along a station's platforms where the ground under it rises and falls (as it does on Bath
Spa's viaduct), and a map's `SERVICES` there say where each service is bound and where it calls,
for the platforms' departure boards. Both files are
optional: without them the game simply has no canal or trains.

### A cable car (optional)

A cable car is laid out by hand: its two stations (by longitude and latitude) and its towers (by
distance from the first station, and height) go in `CABLEWAYS` in `tools/cableway.py`, which writes
them out for the game. Where one really exists, take the ends of OpenStreetMap's `aerialway` line
(in Overture's infrastructure layer) for the stations, as Cape Town's does. `kind="rotair"` gives it
round cabins whose floors turn on the way up, like Table Mountain's; without it the cabins are long
boxes, like Bath's. To write it out:

```sh
python3 -I tools/cableway.py $MAP web/public/maps/$MAP-cable.json
```

The game sets the platforms level on the highest ground under them, hangs the ropes between the
stations and the tower tops, and clears trees, hedges and street furniture off the platforms and
trees from under the cabins' path. Put the stations on open ground and the towers off the roads, and
place the towers so a cabin (8.5 m under its ropes, which sag 2% of each span) clears every roof.

### Pubs for the pause menu (optional)

The pause menu's "Go to a pub" lists every pub in the force field. It comes from Overture's places,
topped up with OpenStreetMap's pubs (osm.geojson, from `tools/osm.py`) and, for the ratings, the FSA (with `wide` on the end for a map with a wider circle, and the
detailed map built first):

```sh
python3 -I tools/download.py $MAP place data/raw/$MAP/wide/place.geojson wide
python3 -I tools/fsa.py $MAP data/raw/$MAP/wide/fsa.geojson wide
python3 -I tools/pubs.py $MAP data/raw/$MAP/wide web/public/maps/$MAP-pubs.json
```

Without the FSA download the pubs are listed without ratings. Without the file at all, the menu
lists just the pubs signed in the detailed map. Names Overture has wrong, or places it calls pubs
that aren't, are fixed in `tools/pubs.py`.

### District names and church towers

The game names the part of the map you're in after OpenStreetMap's districts:
`python3 -I tools/districts.py $MAP` writes `web/public/maps/$MAP-districts.json` (without it the
game falls back on park and square names). In England, `python3 -I tools/towers.py $MAP
data/raw/$MAP/wide` measures each church's tower and spire from the lidar into
`data/$MAP/measured/towers.json`; run it before the squares are built, which place them.
`tools/new_area.py build` runs both.

## 4. Landmarks (optional)

The build can't draw what the data doesn't show, such as a church spire, a portico or an
ornamental bridge. Those go in a landmark pack for the map, `tools/landmarks/<map id>.py` (write
`-` in the id as `_`, or name another with `landmarks` in `tools/area.py`). See
`tools/landmarks/bath.py` for a working example. A pack has:

```python
def place(ctx):
    # return a list of [kind, x, y, ground, angle, ...] landmarks
    ...

def replaces(ctx):          # optional
    # return the indexes of building parts a landmark stands in place of
    ...
```

`ctx` carries the buildings (with their lidar heights), the named places from Overture, the water,
the pitches and the ground height. A landmark can also set `ctx.clear` to the ground it covers, and
the trees, shrubs, garden walls, gates and doors are taken out of it (Twerton Park does). The docstring in `tools/landmarks/__init__.py` lists everything in it.
Find landmarks by name from the map data (`landmarks.named(ctx, "Holy Trinity")`) rather than by
hard-coded coordinates, so the pack keeps working when the data moves a little.

Each kind is drawn by a builder in `web/src/landmarks/`: `spire.ts`, `portico.ts` and
`bridge.ts`, `oak.ts` and `twerton.ts` (a whole football ground, solid, with terraces you can climb) exist already. A new kind is a new file there that returns a `THREE.Object3D` built
around its own origin, with its front facing +z, plus one line in `KINDS` in
`web/src/landmarks/index.ts`.

### Set pieces

A famous building the build can only draw as plain blocks (Bath Abbey, Pulteney Bridge, the Roman
Baths, the Holburne Museum) can instead be a set piece: a detailed model that hides what the build put there, without
changing the build or the map files. Set pieces are listed in `SET_PIECES` in
`web/src/landmarks/setpieces.ts`, each with its longitude and latitude, a bearing, and an outline in
its own frame. As each square loads, the game leaves out everything the build put inside the
outline (buildings, trees, walls, furniture, footpaths), keeps the streets, and adds the set piece
to the square's landmarks. It can lower the ground inside rectangles of its own (the Great Bath),
but never under a street, a pavement or a path. Rebuilding a square, or adding an area round one,
needs nothing doing: the outline catches whatever the build puts there next time. A set piece can
also rebuild what it hides in its own style: Great Pulteney Street and Argyle Street take the
terraces along them and rebuild each block, at its measured front and height, in their own
designs (`terraces.ts`). A new one is an
entry in `SET_PIECES`, a builder in `web/src/landmarks/` made with the kit in `kit.ts`, and its
solid parts in `SOLIDS` in `index.ts`.

## How the build turns the data into a map

`tools/prep_map.py` runs these steps in order. Each step lives in its own module, so it can be
changed for every area at once.

1. **Terrain** (`prep_map.py`): Mapzen terrain tiles become a 4 m height grid. Roads are
   flattened into it. Any road or path Overture flags as a tunnel is carried level between the
   ground at its ends, and where the hill over it is deeper than the arch it becomes a bored
   tunnel (`tunnels.py`), which the game builds as a lit brick tube with a stone face at each
   portal (`web/src/tunnels.ts`). You can walk, or drive, through it. The terrain is cut down to
   the floor in its approaches; shallow underpasses stay ordinary roads.
2. **Footprints** (`prep_map.py`): Overture buildings, simplified to 0.25 m.
3. **Splitting by roof level** (`buildings.roof_parts`): the lidar roof is sampled every metre,
   and a footprint is cut wherever the roof jumps by more than 1.5 m, giving a mansion and its
   wings, or a nave and its aisles, as separate parts. Big irregular parts are then cut into
   rectangles (`buildings.wings`).
4. **Measuring** (`lidar.Lidar.measure`): each part gets its eaves and ridge height from the
   lidar (surface minus ground). `lidar.fit_roof` fits every roof the game can draw (flat, or a
   ridge either way with gabled or hipped ends) and keeps the best fit.
5. **Wall materials** (`epc.py`): each home's energy certificate, placed by its UPRN, says stone,
   brick or render. A building takes the majority, and bungalows get one storey.
6. **Everything else** (`buildings.classify`): where the data is silent, the area's zones in
   `tools/area.py` decide the materials, roof style and storeys, with Overture's building class
   and attachment (detached, semi or terrace) worked out from shared walls.
7. **Trees** (`canopy.py`): Meta's canopy map gives tree positions and low growth. Where lidar is
   present, tree heights and crowns come from it, with roofs and thin things removed. Trunks are
   kept off roads and pavements.
8. **Streets and gardens** (`streets.py`, `gardens.py`, `landscape.py`): pavements, walls, fences
   and hedges, gates, doors, driveways and parked cars. A car that would clash with a wall or a
   building is left out. Each house wall is divided into equal window bays, centred on the wall
   (one window if there's only room for one, none if there isn't); the front door takes the
   middle of a bay, and the game leaves out the ground-floor window behind a door or shopfront.
9. **Shop signs** (`shops.py`): businesses come from OpenStreetMap, which usually maps them on
   the building itself, so its outline picks the building. A non-domestic energy certificate
   placed by its UPRN marks the exact premises, and moves a business mapped only as a point
   nearby. Food hygiene ratings add pubs, cafés and takeaways OpenStreetMap is missing, and an
   Overture place joins only when a certificate confirms it. With no OpenStreetMap download at
   all (the tiles of the wider circle), Overture's places are used instead: only shopfront trades
   it is fairly sure of, each on the nearest building within 15 m that could have a shopfront.
   The fascia goes on the wall facing
   the business's own street, skipping party walls; several businesses in one building share the
   wall. A landmark pack can rename a business to what is over the door (`SIGN_NAMES`) or drop
   one (`SIGN_SKIP`).
10. **Landmarks** (`tools/landmarks/<map>.py`): the map's own pack, if it has one.

The output is one JSON file per map, which the game loads (`web/src/map.ts` describes every field).

## 5. Publish

Commit the new `web/public/maps/<map id>.json` and push `main`. GitHub Pages rebuilds the game.
