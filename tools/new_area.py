"""Add a map of your own area, and build it.

Usage:
  python3 -I tools/new_area.py add "<place name>" [--id slug] [--radius 1500] [--lat N --lon N] [--zone suburb]
  python3 -I tools/new_area.py build <id> [--dry-run]

add: finds the place's centre (OpenStreetMap's Nominatim, unless --lat and --lon are given), then writes
the map into MAPS in tools/area.py and into web/src/maps.ts. --radius is the force field's radius in
metres (the play area is twice that across). The detailed middle is always the 3 x 3 squares of the
standard grid (half = 1565, as Bath's and Bradford-on-Avon's), with the field and the wide circle
round it. Without --lat and --lon the centre is the first match for the name, so check it is the right
place before building.

build: runs the downloads and builds in order (see docs/new-area.md, and .claude/skills/new-area).
Anywhere builds. England has the most data (the Environment Agency's lidar measures the real roofs,
walls and church towers); elsewhere buildings are guessed from Overture's and OpenStreetMap's
heights and floor counts and the area's character, and add says which sources the place will miss.
The energy certificates are never fetched (they need an account: docs/new-area.md). --dry-run prints
the commands and runs none.

It needs Python 3 with numpy, shapely, pillow, scipy, scikit-image, rasterio and overturemaps
(build checks, and says what to install).
"""
import importlib.util, json, math, os, re, subprocess, sys, urllib.parse, urllib.request

TOOLS = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(TOOLS)
AREA_PY = os.path.join(TOOLS, "area.py")
MAPS_TS = os.path.join(ROOT, "web", "src", "maps.ts")
HALF = 1565          # metres from the middle to the edge of the detailed box: the standard square grid
UA = {"User-Agent": "CombeDowner map builder (github.com/danturn/CombeDowner)"}


def option(args, name, default=None):
    if name not in args: return default
    k = args.index(name)
    value = args[k + 1]
    del args[k:k + 2]
    return value


def flag(args, name):
    if name in args: args.remove(name); return True
    return False


def get_json(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        return json.load(r)


# sources that cover only part of the world, by Nominatim's ISO 3166-2 region: what each gives the map
ENGLISH = {
    "lidar": "real roof shapes, eaves heights, garden walls and church towers (Environment Agency lidar)",
    "epc": "wall materials and bungalows (energy certificates, England and Wales, manual download)",
    "parcels": "the Land Registry's garden plots (England and Wales, manual download)",
    "listed": "listed railings and walls (Historic England)",
    "fsa": "pubs and cafes OpenStreetMap is missing (food hygiene ratings, UK)",
}
COVERS = {"GB-ENG": set(ENGLISH), "GB-WLS": {"epc", "parcels", "fsa"}, "GB-NIR": {"fsa"}, "GB-SCT": {"fsa"}}


def region_of(lon, lat):
    """The place's ISO 3166-2 region (GB-ENG, ZA-WC...), or "" if Nominatim can't be reached."""
    try:
        got = get_json("https://nominatim.openstreetmap.org/reverse?" + urllib.parse.urlencode(
            {"lon": lon, "lat": lat, "format": "json", "zoom": 5, "addressdetails": 1}))
    except OSError:
        print("could not check which country that is: assuming none of England's sources")
        return ""
    addr = got.get("address", {})
    return addr.get("ISO3166-2-lvl4") or addr.get("country_code", "").upper()


def warn_missing(region):
    have = COVERS.get(region, set())
    missing = [why for src, why in ENGLISH.items() if src not in have]
    if not missing: return
    print(f"{region or 'this place'} is outside England, so the map will be built without:")
    for why in missing: print(f"  - {why}")
    print("Buildings are guessed from Overture's and OpenStreetMap's heights and floor counts and the "
          "area's zones instead (docs/own-area.md).")


def geocode(name):
    found = get_json("https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({"q": name, "format": "json", "limit": 1}))
    if not found: raise SystemExit(f"no place found for {name!r}: give --lat and --lon")
    print(f"found: {found[0]['display_name']}")
    return float(found[0]["lon"]), float(found[0]["lat"])


def ground_height(lon, lat, z=12):
    """Metres above sea level at a spot, from the Mapzen terrain tiles the builds read (0 if they can't be reached)."""
    import io
    from PIL import Image
    n = 2 ** z
    fx, fy = (lon + 180) / 360 * n, (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    try:
        url = f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{int(fx)}/{int(fy)}.png"
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
            px = Image.open(io.BytesIO(r.read())).convert("RGB").getpixel((int(fx % 1 * 256), int(fy % 1 * 256)))
    except OSError:
        return 0
    return max(0, round(px[0] * 256 + px[1] + px[2] / 256 - 32768))


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def add(args):
    radius = int(option(args, "--radius", 1500))
    lat, lon, zone, map_id = option(args, "--lat"), option(args, "--lon"), option(args, "--zone", "suburb"), option(args, "--id")
    name = args[0]
    map_id = map_id or slug(name)
    if radius < 400 or radius > 4000: raise SystemExit("--radius is metres, between 400 and 4000")
    src = open(AREA_PY).read()
    if f'"{map_id}": dict(' in src: raise SystemExit(f"{map_id!r} is already in tools/area.py")
    centre = (float(lon), float(lat)) if lat and lon else geocode(name)
    region = region_of(*centre)
    warn_missing(region)
    # the detailed box is the 3 x 3 squares at the middle; the force field is the whole circle, and
    # data runs a little past it so the scenery shows beyond the edge
    entry = f'''    "{map_id}": dict(
        name="{name}",
        centre=({centre[0]:.5f}, {centre[1]:.5f}),   # lon, lat: fixed once anything is placed by coordinates
        field=600,                     # the detailed box's own force field: the wide circle below is the play area
        half={HALF},
        zones=[],                      # local character areas, see "Zones" in docs/new-area.md
        default_zone="{zone}",
        region="{region}",                     # ISO 3166-2: which of England's sources the build fetches (tools/new_area.py)
        z0={ground_height(*centre)},                          # metres: what every square's ground heights are measured from (the ground at the middle)
        wide=dict(
            field={radius},
            field_centre=(0, 0),
            half={max(radius + 150, 1600)},
        ),
    ),
'''
    marker = "\n}\n\n\ndef area("
    if marker not in src: raise SystemExit("tools/area.py has changed shape: add the entry by hand (docs/new-area.md)")
    open(AREA_PY, "w").write(src.replace(marker, "\n" + entry.rstrip("\n") + marker, 1))
    ts = open(MAPS_TS).read()
    line = (f'  {{ id: "{map_id}", name: "{name}", blurb: "Your own area, built from open map data", wide: true'
            + " },\n")
    if f'id: "{map_id}"' not in ts:
        if "];\n\n/**" not in ts: raise SystemExit("web/src/maps.ts has changed shape: add the entry by hand")
        open(MAPS_TS, "w").write(ts.replace("];\n\n/**", line + "];\n\n/**", 1))
    print(f"added {map_id}: tools/area.py and web/src/maps.ts. Check the entry in tools/area.py.")
    print(f"next: python3 -I tools/new_area.py build {map_id}")


def build(args):
    dry = flag(args, "--dry-run")
    map_id = args[0]
    missing = [pkg for mod, pkg in (("numpy", "numpy"), ("shapely", "shapely"), ("PIL", "pillow"), ("scipy", "scipy"),
                                    ("skimage", "scikit-image"), ("rasterio", "rasterio"), ("overturemaps", "overturemaps"))
               if importlib.util.find_spec(mod) is None]
    if missing: raise SystemExit("install first: pip3 install " + " ".join(missing))
    py = ["python3", "-I"]
    raw = f"data/raw/{map_id}/wide"
    maps = f"web/public/maps/{map_id}"
    sys.path.insert(0, TOOLS)
    from area import area
    region = getattr(area(map_id), "region", None)
    have = COVERS.get(region, set()) if region is not None else set(ENGLISH)   # older entries were England's
    if region is not None: warn_missing(region)
    only = ["overture", "canopy", "osm"] + [s for s in ("lidar", "fsa") if s in have]
    steps = [
        [*py, "tools/fetch.py", map_id, raw, "--only", ",".join(only)],
        # towers are measured before the squares are built, which place them as landmarks
        *([[*py, "tools/towers.py", map_id, raw]] if "lidar" in have else []),
        [*py, "tools/prep_tiles.py", map_id, raw, maps, "--measure"],
        [*py, "tools/prep_wide.py", map_id, raw, f"{maps}-wide.json", "--measure"],
        [*py, "tools/ground_kinds.py", map_id],
        [*py, "tools/pubs.py", map_id, raw, f"{maps}-pubs.json"],
        [*py, "tools/districts.py", map_id],
        [*py, "tools/check_map.py", map_id],
    ]
    for s in steps:
        print("$", " ".join(s))
        if not dry: subprocess.run(s, cwd=ROOT, check=True)
    print(f"built. Play it: cd web && npm run dev, then http://localhost:5173/?map={map_id}")


def main():
    args = sys.argv[1:]
    if len(args) < 2 or args[0] not in ("add", "build"): raise SystemExit(__doc__)
    {"add": add, "build": build}[args[0]](args[1:])


if __name__ == "__main__":
    main()
