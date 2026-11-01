# Bradford-on-Avon's map data

Everything the Bradford-on-Avon map is built from, as the build reads it, so it rebuilds from a
fresh clone with no downloads. `python3 -I tools/mapdata.py unpack bradford-on-avon` puts it where
the build tools look (`data/raw/bradford-on-avon/wide/`), and the squares and the wide file read
`measured/` straight from here. "Rebuild a map" in the top README has the whole build;
`tools/mapdata.py` says how each part is kept, and `tools/fetch.py` how to fetch it all again.

| File | What | From | Licence |
|---|---|---|---|
| `building`, `segment`, `water`, `land_use`, `land`, `land_cover`, `place`, `infrastructure` `.geojson.xz` | Overture Maps' layers for the wide circle, release 2026-09-23.1, without the properties no tool reads and the outlines no square reads (`prep_tiles.SKIP`) | `tools/download.py` | ODbL (© OpenStreetMap contributors, Overture Maps Foundation, Microsoft) and CDLA Permissive 2.0: see overturemaps.org/attribution |
| `osm.geojson.xz` | OpenStreetMap's shops, pubs, offices and named buildings, downloaded 15 October 2026 | `tools/osm.py` | ODbL, © OpenStreetMap contributors |
| `osm-roads.geojson.xz` | OpenStreetMap's streets and paths with their widths, lanes and pavements (`sidewalk`), for fitting the streets' widths (`tools/roadwidth.py`), downloaded 15 October 2026 | `tools/osm.py ... wide roads` | ODbL, © OpenStreetMap contributors |
| `osm-rail.geojson.xz` | OpenStreetMap's railway: every way tagged `railway`, with only the tags that say what kind it is (`railway`, `service`, `usage`, `gauge`, `tunnel`, `bridge`, `layer`, `name`), so a miniature railway's track is left out (`tools/railway.py`), and every level crossing (`railway=level_crossing` or `crossing`, with `crossing` and `crossing:barrier`), where a way crosses the line at grade (`tools/prep_map.py`), downloaded 1 November 2026 | `tools/osm.py ... wide rail` | ODbL, © OpenStreetMap contributors |
| `fsa.geojson.xz` | Food Standards Agency hygiene ratings, downloaded 15 October 2026 | `tools/fsa.py` | Open Government Licence |
| `epc/certificates.csv.xz` | For each home with an energy certificate in Wiltshire: its UPRN, its latest certificate's date, property type, and the wall material it names (only the word the build looks for). No addresses | the domestic EPC register (Wiltshire) | Open Government Licence |
| `epc/non-domestic.csv.xz` | For each business premises with a certificate: its UPRN, the date, and the words of its name as hashes (`shops.hashed_words`). No addresses | the non-domestic EPC register (Wiltshire) | Open Government Licence |
| `epc/uprn.csv.xz` | Where each of those UPRNs is | OS Open UPRN | Open Government Licence; contains OS data © Crown copyright and database right |
| `terrain15.zip`, `terrain14.zip` | The Mapzen terrarium tiles the builds read (zoom 15 for the squares, the canal and the railway, zoom 14 for the wide file), as their heights | Amazon / Mapzen Terrain Tiles | see github.com/tilezen/joerd/blob/master/docs/attribution.md; in England, Environment Agency data © Crown copyright (Open Government Licence) |
| `measured/<ti>_<tj>.zip` | For each full-detail square, what its build measures from the lidar and the canopy map: what the survey shows of each footprint's roof and where its roof levels split it, the tree canopy, and the walls, fences and hedges seen in it (`tools/walls.py`) | Environment Agency 1 m LIDAR Composite DTM, First Return DSM and Last Return DSM (2022), with Meta / WRI's canopy height map | Open Government Licence, © Environment Agency copyright and/or database right; canopy CC BY 4.0, Meta and World Resources Institute, High Resolution Canopy Height Maps |
| `measured/wide.zip` | The canopy map's tree tops for the wide file, in 2 km windows | Meta / WRI's canopy height map | CC BY 4.0, Meta and World Resources Institute, High Resolution Canopy Height Maps |
