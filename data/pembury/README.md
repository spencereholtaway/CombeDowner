# Hackney's map data (the Pembury Tavern)

Everything the Hackney map is built from, as the build reads it, so it rebuilds from a fresh clone
with no downloads. `python3 -I tools/mapdata.py unpack pembury` puts it where the build tools look
(`data/raw/pembury/wide/`), and the squares and the wide file read `measured/` straight from here.
"Rebuild a map" in the top README has the whole build; `tools/mapdata.py` says how each part is
kept, and `tools/fetch.py` how to fetch it all again (`--only overture,canopy,osm,lidar,fsa`).

Not here yet: Hackney's energy certificates and OS Open UPRN (wall materials), HM Land Registry's
INSPIRE parcels for the London Borough of Hackney, and Historic England's listed railings and walls.
Each needs a download by hand (`docs/new-area.md`); without them walls come from OpenStreetMap's
building materials and the area's zones, and garden plots are guessed.

| File | What | From | Licence |
|---|---|---|---|
| `building`, `segment`, `water`, `land_use`, `land`, `land_cover`, `place`, `infrastructure` `.geojson.xz` | Overture Maps' layers for the wide circle, release 2026-09-23.1, without the properties no tool reads and the outlines no square reads (`prep_tiles.SKIP`) | `tools/download.py` | ODbL (© OpenStreetMap contributors, Overture Maps Foundation, Microsoft) and CDLA Permissive 2.0: see overturemaps.org/attribution |
| `osm.geojson.xz` | OpenStreetMap's shops, pubs, offices and named buildings, downloaded 1 November 2026 | `tools/osm.py` | ODbL, © OpenStreetMap contributors |
| `osm-roads.geojson.xz` | OpenStreetMap's streets and paths with their widths, lanes and pavements (`sidewalk`), downloaded 1 November 2026 | `tools/osm.py ... wide roads` | ODbL, © OpenStreetMap contributors |
| `osm-detail.geojson.xz` | OpenStreetMap's street furniture and other small details, downloaded 1 November 2026 | `tools/osm.py ... wide detail` | ODbL, © OpenStreetMap contributors |
| `fsa.geojson.xz` | Food Standards Agency hygiene ratings, downloaded 1 November 2026 | `tools/fsa.py` | Open Government Licence |
| `terrain15.zip`, `terrain14.zip` | The Mapzen terrarium tiles the builds read (zoom 15 for the squares and the railway, zoom 14 for the wide file), as their heights, with the Environment Agency's lidar ground laid over them (`tools/lidar_ground.py`) | Amazon / Mapzen Terrain Tiles | see github.com/tilezen/joerd/blob/master/docs/attribution.md; Environment Agency data © Crown copyright (Open Government Licence) |
| `measured/<ti>_<tj>.zip` | For each full-detail square, what its build measures from the lidar and the canopy map: what the survey shows of each footprint's roof and where its roof levels split it, the tree canopy, and the walls, fences and hedges seen in it (`tools/walls.py`) | Environment Agency 1 m LIDAR Composite DTM, First Return DSM and Last Return DSM, with Meta / WRI's canopy height map | Open Government Licence, © Environment Agency copyright and/or database right; canopy CC BY 4.0, Meta and World Resources Institute, High Resolution Canopy Height Maps |
| `measured/towers.json` | Church towers and spires measured from the lidar (`tools/towers.py`) | Environment Agency lidar | Open Government Licence |
| `measured/wide.zip` | The canopy map's tree tops for the wide file, in 2 km windows | Meta / WRI's canopy height map | CC BY 4.0, Meta and World Resources Institute, High Resolution Canopy Height Maps |
