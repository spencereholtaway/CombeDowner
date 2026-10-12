# Combe Downer

A multiplayer first-person shooter in the browser, set in Bath. Each map is a circle inside a force
field, built from real open data: Overture Maps buildings, roads, walls, woods and water, on
Environment Agency lidar terrain.

- **Combe Down**: 2 km across, around the Hadley Arms.
- **Royal Victoria Park**: 1.2 km across, from the Great Dell at the park's west end to the Circus,
  with the Royal Crescent, Brock Street and the Avon.

Chavs hang about the streets in gangs. Get spotted and they chase you: they're faster than a walk
but slower than a sprint, and they give up if you get far enough away or out of sight. If they
catch you they hit you. Shooting anyone, player or chav, splashes blood on the ground, and they
leave bloody footprints while they bleed.

The sound effects and the soundtrack (procedural 90s-shooter metal, `web/src/music.ts`) are
synthesised in the browser, so the game ships no audio files.

Multiplayer is peer to peer (WebRTC via [Trystero](https://github.com/dmotz/trystero)): one player
picks a map, creates a room and shares the link, and browsers connect directly. There is no game
server. Entering a room code joins the game in that room on its map; if nobody is playing there,
you host it on the map you picked.

**Play:** https://spencereholtaway.github.io/CombeDowner/

## Run it

```sh
cd web
npm install
npm run dev          # http://localhost:5173
```

Add `?net=local` to the URL to link tabs in one browser instead of using WebRTC (handy for testing).

## Publish

Every push to `main` builds the game and publishes it to GitHub Pages
(`.github/workflows/pages.yml`; Settings → Pages → Source: GitHub Actions).

## Rebuild a map

```sh
pip3 install overturemaps
MAP=combe-down
mkdir -p data/raw/$MAP && cd data/raw/$MAP
for t in building segment water land_use land land_cover infrastructure place; do
  python3 -I ../../../tools/download.py $MAP $t $t.geojson
done
cd ../../..
python3 -I tools/prep_map.py $MAP data/raw/$MAP web/public/maps/$MAP.json
```

Each map's centre, size and local character areas are in `tools/area.py`. To add a map, add it
there and to `web/src/maps.ts`, then build it as above.

## Single-file build

`python3 -I tools/build_single.py web out.html [map]` makes one self-contained HTML file with one
map inline (Combe Down unless you name another). It is solo practice only.

## Credits

Map data © OpenStreetMap contributors, Overture Maps Foundation, Microsoft. Elevation contains
Environment Agency data © Crown copyright (Open Government Licence); terrain tiles by Mapzen.

### Tree canopy (optional)

Trees are placed from Meta / WRI's global canopy height map when a tile is present in
`data/raw/<map>/canopy/`. Both maps sit in the zoom-9 quadkey tile `031313120` (300 MB, so link
it into the second map's folder rather than copying it):

```sh
mkdir -p data/raw/combe-down/canopy data/raw/victoria-park/canopy
curl -o data/raw/combe-down/canopy/031313120.tif \
  https://dataforgood-fb-data.s3.amazonaws.com/forests/v1/alsgedi_global_v6_float/chm/031313120.tif
ln -s ../../combe-down/canopy/031313120.tif data/raw/victoria-park/canopy/
pip3 install rasterio
```
