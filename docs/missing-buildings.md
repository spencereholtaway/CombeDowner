# Missing houses in Cape Town's Newlands squares

Status: **done** (3 November 2026), as the footprints layer (`tools/footprints.py`). The co-developer found
Dean Street with no houses down one side and Montrose Street missing houses on the live Cape Town
map (fork `main` 7c215cc9). The houses were missing from the sources we built from, not dropped by
the build. This note records what each source has there, and what the fallback layer does.

## Where

The Dean Street meant is the one in Newlands, running from about 18.4585, -33.9690 to 18.4652,
-33.9715 beside Dean Lane and Montrose Street, west of Main Road and the Southern Line. In map
metres that is about (4064, -4821), in square 5,-4 (and 5,-3 within 150 m). The other Dean Street
in the data, at 18.414, -33.928, is a service lane in the city centre.

## What each source has

In the box 18.457..18.466 x -33.974..-33.968, round Dean Street and Montrose Street:

| Source | Buildings | Notes |
|---|---|---|
| Overture 2026-09-23.1 (`building`, what we build from) | 81 | by `sources`: 42 OpenStreetMap, 37 Microsoft ML, 2 Google Open Buildings. Our packed copy drops `sources`, so a query against Overture's S3 parquet was needed to see this |
| City of Cape Town 2D Building Footprints (ODP_SPLIT_6 layer 2), every feature | 91 | the same 91 with `BLD_HGT >= 2`, so `heights.geojson` (which keeps only those) loses nothing here: the City's own layer is just as thin |
| `heights.geojson` (the City's, as packed) | 81 by centroid | |
| Google Open Buildings v3 + Microsoft, as VIDA combines them | 630 | 608 Google, 22 Microsoft. They have the terraces and the houses either side of Dean Street, Montrose Street and the streets north of them |

Plotted over the streets, OpenStreetMap, Overture and the City all leave the blocks either side of
Dean Street and Montrose Street mostly empty, and Google's footprints fill them, house by house.

In square 5,-4 as a whole: 179 Overture footprints (by centroid), 250 of the City's, and 280
buildings in the built square (more than Overture's, as big footprints are split into wings). So
the build isn't losing these houses: they were never in its input.

Across the whole Cape Town wide circle: Overture 34,448 buildings, the City's heights layer
50,100, and VIDA 91,956 (88,612 Google, 3,344 Microsoft). Per square the City's layer often has
far more than Overture (6,-5: 1,385 to 620; 8,-2: 468 to 10). Overture appears to take Microsoft's
footprints where OpenStreetMap has nothing, but almost none of Google's.

## The fallback

Every map packs a `footprints` layer beside `building` (empty where there's nothing to add),
holding only the footprints no better source already has, and every reader of the buildings takes
it with them. The map lists its sources in `tools/area.py` (`footprints`), best first; Cape Town
lists the City's outlines (`"survey"`, the heights layer's) and then Google's (`"google"`, at
confidence 0.75 or more; the dataset's floor is 0.65). A footprint overlapping a better one by more
than 10% of the smaller is left out, one overlapping it less is cut back to meet it, and anything
under 10 m² is left out. Microsoft's are not a source, as Overture already takes them where
OpenStreetMap has none. The British maps list no sources, fetch nothing and pack an empty layer.

For Cape Town that is 35,183 buildings: 20,295 of the City's and 14,888 of Google's, on top of
Overture's 34,448. They carry nothing but an outline. The City's take their roof height from the
heights layer, as every building over a surveyed roof does; Google's take the area's guess, as any
building without a survey or a floor count does in Cape Town (`buildings.cape_eaves`: by the zone
and the building's kind, drawn once for each row of attached houses).

Without the City's outlines, Google's footprints overlapping nothing in Overture would come to
42,201 at 0.65, 33,719 at 0.7, 24,986 at 0.75 and 16,537 at 0.8; Microsoft's not already in Overture
come to 2,638 more in Cape Town, 469 in Bath, 117 in Hackney and 91 in Bradford-on-Avon.

Google's footprints are fetched from VIDA's per-country GeoParquet,
`https://data.source.coop/vida/google-microsoft-open-buildings/geoparquet/by_country/country_iso=ZAF/ZAF.parquet`,
read with duckdb (httpfs, spatial) and filtered on its `bbox` column to the map's wide box, in
about 15 s. The files are named by ISO 3166-1 alpha-3: the map's `country` in `tools/area.py`.

## Licences

- Google Open Buildings v3: CC BY 4.0 or ODbL, at the user's choice.
- VIDA's combined dataset: ODbL.
- City of Cape Town 2D Building Footprints: the City's Open Data Policy (free for any use; credit
  "City of Cape Town"), as for the heights already used.

They are in `data/cape-town/README.md`, the credits in `README.md` and the game's credits line
(`web/index.html`).

## Open questions

- Quality: Google's footprints at 0.75 look right round Dean Street, Montrose Street and the
  southern suburbs, but nobody has looked at informal settlements, industrial roofs or things under
  trees.
- Streets: guessed footprints clash with a street's carriageway at about the rate OpenStreetMap's
  do (check rule 9). They could give way to the street as the railway's clearance cuts buildings
  back (`prep_map.clear_of_line`).
