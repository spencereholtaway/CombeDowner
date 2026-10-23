# Making your own area, without Claude

The recipe is in `docs/new-area.md` and, for Claude Code users, the `new-area` skill
(`.claude/skills/new-area/SKILL.md`). This note is about how far a plain script or a small web page
could take someone who has neither, what stays hard, and what to build.

## What is already automatic

Every step after "decide where" is a command that takes the map id and nothing else, because
`tools/area.py` holds the area's settings and every tool reads them from there:

- downloads: `tools/fetch.py` (Overture layers, canopy, OpenStreetMap, England's lidar and hygiene ratings);
- builds: `tools/prep_tiles.py`, `tools/prep_wide.py`, `tools/ground_kinds.py`, `tools/pubs.py`;
- check: `tools/check_map.py`.

`tools/new_area.py` (added with this note) is the thin wrapper over that: `add "Place" --radius 1500`
geocodes the name with Nominatim and writes the `MAPS` entry in `tools/area.py` and the menu line in
`web/src/maps.ts`, and `build <id>` runs the steps in order. It adds no new logic, so it is cheap to keep true. It
refuses places outside England (see below). I ran the whole thing for Frome, Somerset (radius 900 m).

## What a single script still cannot do for you

| Step | Why it is hard to automate |
|---|---|
| **Choosing the centre** | A geocoded name gives a town's official middle, often a road junction or a council office. A good map centres on something you would walk to, and `centre` can never change afterwards (landmarks and the mines' door are placed by coordinates). Needs a human eye on a map. |
| **England only** | The Environment Agency's open 1 m lidar is what measures roofs, tree heights and walls, and the build needs it. Wales and Scotland publish their own surveys on other sites; `tools/lidar.py` assumes British National Grid and `tools/fetch.py` computes the Agency's square names, so they would be code, not a flag. `new_area.py add` refuses a place whose Nominatim region is not England. It does not check that the Agency's tiles cover the spot (they cover nearly all of England). Other countries would need the no-lidar work on the Cape Town branch (`claude/cape-town`, commit `46b1f28`), which is paused. |
| **Energy certificates and OS Open UPRN** | Wall materials and bungalows, England and Wales only. Needs an account and a manual CSV download, and the licence forbids redistributing addresses (`tools/mapdata.py` strips them). Optional: leave it out. |
| **Licences when sharing** | Overture is ODbL/CDLA, OpenStreetMap ODbL, canopy CC BY 4.0, lidar OGL. Fine to build and play locally. Committing a map to the repository means writing the sources and licences into `data/<id>/README.md`, as the other maps do. |
| **Zones (what the houses look like)** | `default_zone` and `zones` set wall material, roof style and storeys where the data is silent. Only Bath's four zones, `london` and `suburb` exist. A plain `suburb` default looks generic but acceptable. |
| **Canals, railways, cable cars** | Each has area-specific code or a hand-written pack (`tools/canal.py` locks and levels, `tools/cableway.py`). A town without them needs none. |
| **Landmarks** | A church spire, a bridge or a stadium is drawn by hand (`tools/landmarks/`, `web/src/landmarks/`). Not automatable, and the point of a personal map. |
| **Running on a stranger's machine** | Python with numpy, shapely, pillow, scipy, scikit-image (the first Frome run failed on the last two, which nothing listed), rasterio (needs GDAL on some machines) and overturemaps, plus Node and a Chrome for screenshots. `build` now checks the packages first. Most failures people would hit are here, not in the map code. |
| **Network failures** | Overture's S3 reads and the OpenStreetMap APIs fail now and then. `fetch.py` now writes each download to a `.part` name and renames it when done, so a dropped connection is simply rerun. |

## How long it takes

Measured on Frome (radius 900 m, 13 squares, a 14-core Mac, a home connection):

- downloads: about 25 minutes. The eight Overture layers for the 3.2 km box took from 17 s
  (`place`) to 169 s (`land_cover`) each, about nine minutes in all; the rest is the 290 MB canopy
  tile and five Environment Agency lidar squares (three files each, about 75 MB per file);
- the 13 squares: 76 s;
- the wide file, ground, pubs and check: about 20 s;
- first start in the browser: seconds.

So half an hour end to end, almost all waiting for downloads. A rebuild after a tool change is a
minute or two, because `prep_tiles.py` rebuilds only what changed. A bigger radius adds squares
(about 30 s of build each, one per core at a time) and a little download.

## Is a small local web page realistic?

Yes, as a local tool. Not as a hosted service.

A local version is a Python `http.server` (no new dependency) with one page: a Leaflet or
MapLibre map, click to place the centre, a slider for the radius that draws the circle, a Build button. The server runs `new_area.py add` and then `build` as subprocesses and
streams their output to the page (server-sent events or polling a log), and when the build exits it
links to `http://localhost:5173/?map=<id>` (or starts `npm run dev`). Most of that is glue: the
tools already print progress, and `prep_tiles.py` prints `[n/N]` per square.

Rough size: a day for something that works for a developer, two or three days to make it survive
a stranger's machine (dependency check with install hints, resumable downloads, cancel, readable
errors, showing the check report and a screenshot of the middle, a `z0` filled in from the terrain).
The map picker is the easy part. The cost is everything in the "hard" table above, which a page
cannot hide, only report.

Hosting it is a different thing: each build is a dozen CPU-minutes, up to a few hundred megabytes of
transient downloads and tens of megabytes of output per person, and the licence and abuse questions
of generating maps for the public. Not worth it. The alternative that does scale is what already
exists: the repository's "Rebuild the map" workflow builds on GitHub's machines for whoever has
their own fork.

## Recommendation

1. Keep the script, finish it, and do not build a web page yet. `tools/new_area.py` plus the skill
   covers people with Claude Code (the skill walks them through the choices a script cannot make) and
   people without (the README paragraph points at the script).
2. Small wins left: print the place's type and bounding box so a wrong geocoder match is obvious,
   and check that the lidar tiles exist before downloading the rest.
3. If people want a picker after that, build the local page above on top of `new_area.py` unchanged.
   Do not put work into hosting it.
