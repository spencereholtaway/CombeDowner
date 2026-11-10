"""Add a map of your own area, build it, and check it, in commands that print PASS or FAIL.

Usage:
  python3 -I tools/new_area.py check                    is this machine ready? (packages, Node, Chrome, branch, disk)
  python3 -I tools/new_area.py find "<place name>"      the five best matches, each with its lat/lon and BRANCH
  python3 -I tools/new_area.py add "<place name>" --lat N --lon N [--id slug] [--radius 1500] [--zone suburb] [--in-menu]
  python3 -I tools/new_area.py build <id> [--dry-run]   download and build, in order
  python3 -I tools/new_area.py verify <id>              the files, the clash check, sizes and what git sees
  python3 -I tools/new_area.py shoot <id>               screenshots at four views chosen from the map, and the frame rate
  python3 -I tools/new_area.py remove <id>              undo add and build for a map that was never committed

The step-by-step guide is .claude/skills/new-area/SKILL.md; docs/new-area.md has the background.

add writes the map into MAPS in tools/area.py and web/src/maps.ts. --radius is the force field's
radius in metres (the play area is twice that across). The detailed middle is always the 3 x 3
squares of the standard grid (half = 1565), with the field and the wide circle round it. Without
--lat and --lon the centre is the first match for the name. The map is left out of the menu (a test
map, played with ?map=<id>) unless --in-menu is given.

Which data a place gets depends on its region (ISO 3166-2, from Nominatim): England has the most (the
Environment Agency's lidar measures the real roofs, walls and church towers), Wales, Scotland and
Northern Ireland a little, everywhere else only the worldwide sources. Each command prints the
BRANCH: UK or NON-UK.

Every command finds a Python with the packages the build needs (this one, then
~/.venvs/combedowner, then .venv in the repository) and runs itself with that one. Heavy steps take
the shared build lock (~/.combedowner-build.lock, the one tools/mac_build.sh takes), so only one
map build or set of screenshots runs on a machine at a time.
"""
import importlib.util, json, math, os, re, resource, shutil, subprocess, sys, time, urllib.parse, urllib.request

TOOLS = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(TOOLS)
AREA_PY = os.path.join(TOOLS, "area.py")
MAPS_TS = os.path.join(ROOT, "web", "src", "maps.ts")
HALF = 1565          # metres from the middle to the edge of the detailed box: the standard square grid
UA = {"User-Agent": "CombeDowner map builder (https://combedowner.com)"}
PACKAGES = (("numpy", "numpy"), ("shapely", "shapely"), ("PIL", "pillow"), ("scipy", "scipy"),
            ("skimage", "scikit-image"), ("rasterio", "rasterio"), ("overturemaps", "overturemaps"), ("pyproj", "pyproj"))
PYTHONS = (os.path.expanduser("~/.venvs/combedowner/bin/python3"), os.path.join(ROOT, ".venv", "bin", "python3"))
LOCK = os.path.expanduser("~/.combedowner-build.lock")
SUFFIXES = ("wide", "ground", "pubs", "districts", "rail", "canal", "cable")     # web/public/maps/<id>-<suffix>.json
# the maps already in the repository: remove refuses them
KEPT = {"combe-down", "victoria-park", "pembury", "cape-town", "bradford-on-avon"}


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


def missing_packages():
    return [pkg for mod, pkg in PACKAGES if importlib.util.find_spec(mod) is None]


def ensure_python():
    """Run under a Python that has every package, if there is one; the child is told not to look again."""
    if not missing_packages() or os.environ.get("CD_NEW_AREA_PY"): return
    probe = "import importlib.util,sys;sys.exit(any(importlib.util.find_spec(m) is None for m in %r))" % [m for m, _ in PACKAGES]
    for py in PYTHONS:
        if os.path.exists(py) and subprocess.run([py, "-I", "-c", probe]).returncode == 0:
            os.environ["CD_NEW_AREA_PY"] = py
            os.execv(py, [py, "-I", os.path.abspath(__file__), *sys.argv[1:]])


# sources that cover only part of the world, by Nominatim's ISO 3166-2 region: what each gives the map
ENGLISH = {
    "lidar": "real roof shapes, eaves heights, garden walls, church towers and true ground (lidar: the Environment Agency's in England, the Welsh Government's in Wales)",
    "epc": "wall materials and bungalows (energy certificates, England and Wales, manual download)",
    "parcels": "the Land Registry's garden plots (England and Wales; only Bath's partition build reads them)",
    "listed": "listed railings and walls (Historic England; only Bath's partition build reads them)",
    "fsa": "pubs and cafes OpenStreetMap is missing, and pub hygiene ratings (food hygiene ratings, UK)",
    "census": "the mix of flats, terraces, semis and detached houses in each street (2021 Census, England and Wales)",
    "conservation": "the old core of the town, built of what its old buildings are (conservation areas, England)",
}
COVERS = {"GB-ENG": set(ENGLISH), "GB-WLS": {"lidar", "epc", "parcels", "fsa", "census"}, "GB-NIR": {"fsa"}, "GB-SCT": {"fsa"}}


def branch(region):
    return "UK" if (region or "").startswith("GB-") else "NON-UK"


def region_of(lon, lat):
    """The place's ISO 3166-2 region (GB-ENG, ZA-WC...), or "" if Nominatim can't be reached."""
    try:
        got = get_json("https://nominatim.openstreetmap.org/reverse?" + urllib.parse.urlencode(
            {"lon": lon, "lat": lat, "format": "json", "zoom": 5, "addressdetails": 1}))
    except OSError:
        print("WARN could not reach Nominatim to check the country: assuming NON-UK")
        return ""
    addr = got.get("address", {})
    return addr.get("ISO3166-2-lvl4") or addr.get("country_code", "").upper()


MANUAL = {"epc", "parcels"}     # never fetched by build: they need a hand download (and the parcels only serve Bath's partition)


def warn_missing(region):
    have = COVERS.get(region, set()) - MANUAL
    print(f"The map will be built without:", flush=True)
    for src, why in ENGLISH.items():
        if src not in have: print(f"  - {why}" + (" [by hand only]" if src in MANUAL and src in COVERS.get(region, set()) else ""))
    if "lidar" not in have:
        print("Buildings are guessed from Overture's and OpenStreetMap's heights and floor counts and the area's zones instead.")


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


def ok(cond, what, fix=""):
    print(f"{'PASS' if cond else 'FAIL'} {what}" + ("" if cond or not fix else f"  ->  {fix}"))
    return cond


# ---- check ---------------------------------------------------------------------------------------

def check(args):
    good = True
    v = sys.version_info
    good &= ok(v >= (3, 11), f"python {v.major}.{v.minor} at {sys.executable}", "install Python 3.11 or newer")
    miss = missing_packages()
    good &= ok(not miss, "python packages: " + ("all there" if not miss else "missing " + " ".join(miss)),
               "python3 -m venv ~/.venvs/combedowner && ~/.venvs/combedowner/bin/pip install "
               + " ".join(p for _, p in PACKAGES) + "   (then run check again)")
    node = shutil.which("node")
    nv = subprocess.run([node, "--version"], capture_output=True, text=True).stdout.strip() if node else ""
    good &= ok(bool(re.match(r"v(2[0-9]|[3-9][0-9])\.", nv)), f"node {nv or 'not found'} (20 or newer)", "install Node 22")
    nm = os.path.join(ROOT, "web", "node_modules")
    good &= ok(os.path.isdir(os.path.join(nm, "vite")) and os.path.isdir(os.path.join(nm, "playwright")),
               "web/node_modules has vite and playwright", "cd web && npm install && cd ..")
    chrome = any(os.path.exists(p) for p in ("/Applications/Google Chrome.app", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable",
                                             "C:/Program Files/Google/Chrome/Application/chrome.exe")) or bool(os.environ.get("CHROME"))
    good &= ok(chrome, "Google Chrome installed (for screenshots)", "install Google Chrome, or set CHROME=<path to a Chrome>")
    br = subprocess.run(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    good &= ok(br not in ("main", "master", "HEAD", ""), f"git branch is {br or 'unknown'} (not main)",
               "git switch -c claude/map-<id>")
    free = shutil.disk_usage(ROOT).free / 1e9
    good &= ok(free > 10, f"{free:.0f} GB free on disk (10 GB needed)", "free some disk space")
    try:
        get_json("https://nominatim.openstreetmap.org/search?q=Bath&format=json&limit=1")
        net = True
    except OSError:
        net = False
    good &= ok(net, "network: nominatim.openstreetmap.org answers", "check the internet connection")
    print("CHECK PASS" if good else "CHECK FAIL")
    if not good: sys.exit(1)


# ---- find and add --------------------------------------------------------------------------------

def find(args):
    if not args: raise SystemExit('usage: new_area.py find "<place name>"')
    found = get_json("https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {"q": args[0], "format": "json", "limit": 5, "addressdetails": 1}))
    if not found: raise SystemExit(f"FAIL no place found for {args[0]!r}: try another spelling, or add the county or country")
    for k, f in enumerate(found, 1):
        addr = f.get("address", {})
        region = addr.get("ISO3166-2-lvl4") or addr.get("country_code", "").upper()
        print(f"{k}. {f['display_name']}")
        print(f"   kind: {f.get('class')}/{f.get('type')}   region: {region or '?'}   BRANCH: {branch(region)}")
        print(f"   --lat {float(f['lat']):.5f} --lon {float(f['lon']):.5f}")


def add(args):
    radius = int(option(args, "--radius", 1500))
    lat, lon, zone, map_id = option(args, "--lat"), option(args, "--lon"), option(args, "--zone", "suburb"), option(args, "--id")
    in_menu = flag(args, "--in-menu")
    if not args: raise SystemExit(__doc__)
    name = args[0]
    map_id = map_id or slug(name)
    if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", map_id): raise SystemExit(f"FAIL --id {map_id!r}: lower case letters, digits and single dashes only")
    if radius < 400 or radius > 4000: raise SystemExit("FAIL --radius is metres, between 400 and 4000")
    src = open(AREA_PY).read()
    if f'"{map_id}": dict(' in src: raise SystemExit(f"FAIL {map_id!r} is already in tools/area.py: pick another --id")
    if lat and lon:
        centre = (float(lon), float(lat))
    else:
        found = get_json("https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({"q": name, "format": "json", "limit": 1}))
        if not found: raise SystemExit(f"FAIL no place found for {name!r}: give --lat and --lon")
        print(f"found: {found[0]['display_name']}")
        centre = float(found[0]["lon"]), float(found[0]["lat"])
    region = region_of(*centre)
    warn_missing(region)
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
    if marker not in src: raise SystemExit("FAIL tools/area.py has changed shape: STOP and ask")
    open(AREA_PY, "w").write(src.replace(marker, "\n" + entry.rstrip("\n") + marker, 1))
    ts = open(MAPS_TS).read()
    line = (f'  {{ id: "{map_id}", name: "{name}", blurb: "Your own area, built from open map data", wide: true'
            + ("" if in_menu else ", hidden: true") + " },\n")
    if f'id: "{map_id}"' not in ts:
        if "];\n\n/**" not in ts: raise SystemExit("FAIL web/src/maps.ts has changed shape: STOP and ask")
        open(MAPS_TS, "w").write(ts.replace("];\n\n/**", line + "];\n\n/**", 1))
    print(f"region: {region or '?'}")
    print(f"BRANCH: {branch(region)}")
    print(f"ADDED {map_id}: tools/area.py and web/src/maps.ts")
    print(f"next: python3 -I tools/new_area.py build {map_id}")


# ---- build ---------------------------------------------------------------------------------------

class BuildLock:
    """The machine's one build lock (tools/mac_build.sh takes the same one)."""
    def __enter__(self):
        said = False
        while True:
            try:
                os.mkdir(LOCK); break
            except FileExistsError:
                if time.time() - os.path.getmtime(LOCK) > 3600:
                    print("clearing a stale build lock"); shutil.rmtree(LOCK, ignore_errors=True); continue
                if not said: print(f"waiting for another build to finish (lock {LOCK})", flush=True); said = True
                time.sleep(10)
        return self

    def touch(self):
        try: os.utime(LOCK)
        except OSError: pass

    def __exit__(self, *exc):
        shutil.rmtree(LOCK, ignore_errors=True)


def settings(map_id):
    sys.path.insert(0, TOOLS)
    from area import MAPS, area
    if map_id not in MAPS: raise SystemExit(f"FAIL {map_id!r} is not in tools/area.py: run add first")
    return area(map_id)


def run_steps(steps, dry, lock=None):
    """Each step is (name, command, needed). A needed step that fails stops the build; the rest warn."""
    for name, cmd, needed in steps:
        print(f"\n== {name}\n$ " + " ".join(cmd), flush=True)
        if dry: continue
        before = resource.getrusage(resource.RUSAGE_CHILDREN)
        t0 = time.time()
        code = subprocess.run(cmd, cwd=ROOT, env=dict(os.environ, PYTHONUNBUFFERED="1")).returncode
        after = resource.getrusage(resource.RUSAGE_CHILDREN)
        cpu = (after.ru_utime + after.ru_stime) - (before.ru_utime + before.ru_stime)
        mb = after.ru_maxrss / (1 if sys.platform == "darwin" else 1 / 1024) / 1e6
        print(f"STEP {name}: {'ok' if code == 0 else 'FAILED'} in {time.time() - t0:.0f}s, "
              f"{cpu:.0f} cpu-seconds, largest process so far {mb:.0f} MB", flush=True)
        if lock: lock.touch()
        if code != 0:
            if needed: raise SystemExit(f"BUILD FAIL at step {name} (exit {code}): see the lines above")
            print(f"WARN step {name} failed; the map builds without it")


def build(args):
    dry = flag(args, "--dry-run")
    if not args: raise SystemExit(__doc__)
    map_id = args[0]
    miss = missing_packages()
    if miss: raise SystemExit("BUILD FAIL missing packages: " + " ".join(miss) + ". Run: python3 -I tools/new_area.py check")
    A = settings(map_id)
    py = [sys.executable, "-I"]
    raw = f"data/raw/{map_id}/wide"
    maps = f"web/public/maps/{map_id}"
    region = getattr(A, "region", None)
    have = COVERS.get(region, set()) if region is not None else set(ENGLISH)
    print(f"BRANCH: {branch(region)}   region: {region or '?'}")
    if region is not None: warn_missing(region)
    only = ["overture", "canopy", "osm"] + [s for s in ("lidar", "fsa", "census", "conservation") if s in have]
    t0 = time.time()
    run_steps([("download", [*py, "tools/fetch.py", map_id, raw, "--only", ",".join(only)], True)], dry)
    t_dl = time.time() - t0
    lidar = "lidar" in have
    squares = ("squares", [*py, "tools/prep_tiles.py", map_id, raw, maps, "--measure"], True)
    wide = ("wide map", [*py, "tools/prep_wide.py", map_id, raw, f"{maps}-wide.json", "--measure"], True)
    # the lidar's ground replaces the terrain tiles' once they are all fetched (the first build fetches
    # them), so in England the squares and the wide map are built a second time, once
    marker = os.path.join(ROOT, raw, "terrain15", ".lidar-ground")
    regrade = lidar and not os.path.exists(marker)
    steps = [
        # the downloads packed into the map's own layers, the same for every map: the squares read them
        # (and it makes the map's data folder, which the ecoregion writes into)
        ("pack layers", [*py, "tools/mapdata.py", "pack", map_id, raw], True),
        # the ecoregion next: it says what the satellite's shrubland is
        ("ecoregion", [*py, "tools/region.py", map_id, "fetch"], False),
        # then the railway: the squares cut the ground to its levels
        ("railway", [*py, "tools/railway.py", map_id, raw, f"{maps}-rail.json"], False),
        *([("church towers", [*py, "tools/towers.py", map_id, raw], False)] if lidar else []),
        squares, wide,
        *([("lidar ground", [*py, "tools/lidar_ground.py", map_id, raw], True),
           ("lidar ground done", [*py, "-c", f"open({marker!r}, 'w').close()"], True),
           ("railway again", [*py, "tools/railway.py", map_id, raw, f"{maps}-rail.json"], False),
           ("squares again", *squares[1:]), ("wide map again", *wide[1:])] if regrade else []),
        ("minimap ground", [*py, "tools/ground_kinds.py", map_id], True),
        ("pubs", [*py, "tools/pubs.py", map_id, raw, f"{maps}-pubs.json"], False),
        ("district names", [*py, "tools/districts.py", map_id], False),
        ("region look", [*py, "tools/region.py", map_id], False),
    ]
    t1 = time.time()
    if dry: run_steps(steps, dry)
    else:
        with BuildLock() as lock: run_steps(steps, dry, lock)
    print(f"\nTIMES download {t_dl:.0f}s, build {time.time() - t1:.0f}s, on {os.cpu_count()} cores")
    print(f"BUILD OK {map_id}" if not dry else "DRY RUN: nothing was run")
    print(f"next: python3 -I tools/new_area.py verify {map_id}")


# ---- verify --------------------------------------------------------------------------------------

def size(*paths):
    total = 0
    for p in paths:
        if os.path.isfile(p): total += os.path.getsize(p)
        for d, _, names in os.walk(p):
            total += sum(os.path.getsize(os.path.join(d, n)) for n in names if not os.path.islink(os.path.join(d, n)))
    return total


def verify(args):
    import glob, gzip
    if not args: raise SystemExit(__doc__)
    map_id = args[0]
    settings(map_id)
    good = True
    maps = os.path.join(ROOT, "web", "public", "maps")
    good &= ok(f'id: "{map_id}"' in open(MAPS_TS).read(), "web/src/maps.ts has the map")
    whole = os.path.join(maps, f"{map_id}.json")
    good &= ok(os.path.exists(whole), f"web/public/maps/{map_id}.json")
    index = os.path.join(maps, map_id, "tiles.json")
    listed = json.load(open(index))["tiles"] if os.path.exists(index) else []
    built = [t for t in listed if os.path.exists(os.path.join(maps, map_id, f"{t[0]}_{t[1]}.json"))]
    good &= ok(len(listed) >= 9 and len(built) == len(listed), f"squares: {len(built)} of {len(listed)} built (9 or more)")
    for suffix, needed in (("wide", True), ("ground", True), ("pubs", False), ("districts", False), ("rail", False)):
        there = os.path.exists(os.path.join(maps, f"{map_id}-{suffix}.json"))
        if needed: good &= ok(there, f"web/public/maps/{map_id}-{suffix}.json")
        else: print(f"{'INFO' if there else 'WARN'} web/public/maps/{map_id}-{suffix}.json {'there' if there else 'missing (optional)'}")
    if built:
        sq = [json.load(open(os.path.join(maps, map_id, f"{a}_{b}.json"))) for a, b in built]
        nb, nr, nw = (sum(len(m.get(k) or []) for m in sq) for k in ("bl", "rd", "wp"))
        good &= ok(nb + nr + nw > 0, f"in the squares: {nb} buildings, {nr} roads and paths, {nw} pieces of water")
        if nb < 50: print(f"INFO only {nb} buildings: open country, or the data is thin here")
    if good:
        print("\n== clash check (tools/check_map.py)", flush=True)
        env = dict(os.environ, SHOW="2", CD_OVERROAD="0")
        with BuildLock():
            out = subprocess.run([sys.executable, "-I", "tools/check_map.py", map_id], cwd=ROOT, env=env, capture_output=True, text=True)
        err = out.stderr.strip().splitlines()
        good &= ok(out.returncode == 0, "check_map ran", "its last error line: " + (err[-1] if err else "none"))
        counts = [int(m.group(1)) for m in re.finditer(r"^\s+(\d+)\s{2}\d", out.stdout, re.M)]
        total = sum(counts)
        per = total / max(1, len(built))
        print(out.stdout.strip())
        # Bradford-on-Avon has 16 per square and Hackney 80: past 150 something has gone wrong
        print(f"{'PASS' if per <= 150 else 'WARN'} clash check: {total} failures over {len(built)} squares, {per:.0f} per square (150 or fewer)")
    files = [p for p in [whole, *(os.path.join(maps, f"{map_id}-{s}.json") for s in SUFFIXES)] if os.path.exists(p)]
    pub = size(*files, os.path.join(maps, map_id))
    gz = sum(len(gzip.compress(open(f, "rb").read(), 6)) for f in files + glob.glob(os.path.join(maps, map_id, "*.json")))
    print(f"SIZE published web/public/maps/{map_id}*: {pub / 1e6:.1f} MB ({gz / 1e6:.1f} MB gzipped)")
    print(f"SIZE raw downloads data/raw/{map_id}: {size(os.path.join(ROOT, 'data', 'raw', map_id)) / 1e6:.0f} MB (never committed)")
    print(f"SIZE measured data/{map_id}: {size(os.path.join(ROOT, 'data', map_id)) / 1e6:.1f} MB")
    st = subprocess.run(["git", "status", "--porcelain", "--untracked-files=all"], cwd=ROOT, capture_output=True, text=True).stdout.splitlines()
    mine = (f"web/public/maps/{map_id}", f"data/{map_id}/", f"shots/{map_id}/", "tools/area.py", "web/src/maps.ts")
    other = [l for l in st if not l[3:].startswith(mine)]
    good &= ok(not other, "git sees changes only to this map's files" + ("" if not other else ": also " + ", ".join(l[3:] for l in other[:5])),
               "STOP and ask: something outside this map changed")
    print("VERIFY PASS" if good else "VERIFY FAIL")
    if not good: sys.exit(1)


# ---- shoot ---------------------------------------------------------------------------------------

def views(map_id):
    """Four views from the built map: the centre at eye height, the centre from the air, the best
    road near the centre looking along it (a main street in a town, a lane or track out in the
    country), and the force field's edge looking in. A view that would stand in water (a map
    centred on a lake or reservoir) is moved south onto its shore."""
    import shapely
    from shapely.geometry import Point, Polygon
    sys.path.insert(0, TOOLS)
    from area import area
    W = area(map_id, wide=True)
    (fx, fy), R = W.field_centre, W.field
    maps = os.path.join(ROOT, "web", "public", "maps")
    best, water = None, []
    rank = {"primary": 9, "secondary": 8, "tertiary": 7, "residential": 6, "unclassified": 5, "living_street": 5,
            "service": 4, "track": 3, "bridleway": 2, "path": 1, "footway": 1}
    for a, b in json.load(open(os.path.join(maps, map_id, "tiles.json")))["tiles"]:
        m = json.load(open(os.path.join(maps, map_id, f"{a}_{b}.json")))
        for w in m.get("wp") or []:
            ring = [q[:2] for q in w["r"][0]]
            if len(ring) >= 3: water.append(Polygon(ring).buffer(0))
        for r in m["rd"]:
            if r["c"] not in rank or len(r["p"]) < 4: continue
            p = r["p"]
            k = len(p) // 2
            x, y = p[k][0], p[k][1]
            if math.hypot(x - fx, y - fy) > 0.6 * R: continue
            length = sum(math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]) for i in range(len(p) - 1))
            score = (rank[r["c"]], length)
            if best is None or score > best[0]:
                dx, dy = p[k + 1][0] - p[k - 1][0], p[k + 1][1] - p[k - 1][1]
                best = (score, x, y, math.degrees(math.atan2(dx, dy)) % 360, r.get("n") or r["c"])
    wet = shapely.unary_union(water) if water else None

    def dry(x, y):
        """The first spot south of (x, y), 25 m at a time, that isn't in water: then looking north, back at it."""
        for k in range(80):
            if wet is None or not wet.contains(Point(x, y - 25 * k)): return x, y - 25 * k
        return x, y

    cx, cy = dry(0, 0)
    out = {"centre": f"{cx:.0f},{cy:.0f},0,-5", "centre-air": f"{cx:.0f},{cy - 120:.0f},0,-35,90"}
    if best:
        _, x, y, bearing, name = best
        out["road"] = f"{x:.0f},{y:.0f},{bearing:.0f},-3"
        print(f"road: {name} ({'a main street' if best[0][0] >= 6 else 'a lane or track'})", flush=True)
    else:
        print("road: none near the centre, so no road view", flush=True)
    ex, ey = dry(fx, fy - 0.9 * R)
    out["edge"] = f"{ex:.0f},{ey:.0f},0,-5"
    return out


def shoot(args):
    if not args: raise SystemExit(__doc__)
    map_id = args[0]
    settings(map_id)
    v = views(map_id)
    shots = os.path.join(ROOT, "shots", map_id)
    os.makedirs(shots, exist_ok=True)
    vf = os.path.join(shots, "views.json")
    json.dump(v, open(vf, "w"), indent=1)
    for name, at in v.items(): print(f"view {name}: ?at={at}", flush=True)
    with BuildLock():
        code = subprocess.run(["npm", "run", "shoot", "--", vf, "--map", map_id, "--out", shots], cwd=os.path.join(ROOT, "web")).returncode
    good = ok(code == 0, "npm run shoot finished")
    log = os.path.join(shots, "shots.json")
    if code == 0 and os.path.exists(log):
        L = json.load(open(log))
        for s in L["shots"]:
            good &= ok(s["ready"], f"{s['name']}: loaded, {s.get('fps') or 0:.0f} fps, {os.path.relpath(s['file'], ROOT)}")
        fps = [s.get("fps") or 0 for s in L["shots"]]
        print(f"{'PASS' if min(fps) >= 20 else 'WARN'} frame rate: lowest {min(fps):.0f} fps over the views (20 or more on a desktop)")
        # the page's console can't be told apart from its uncaught errors here, so they are for the
        # report; a view that broke the page shows as not loaded above
        errors = [c for c in L.get("complaints", []) if c.startswith("error") and "status of 404" not in c]
        for c in L.get("complaints", [])[:8]: print(f"INFO page said: {c}")
        print(f"{'PASS' if not errors else 'WARN'} page errors: {len(errors)} (missing optional files left out)")
    print("SHOOT PASS" if good else "SHOOT FAIL")
    print(f"look at each picture: shots/{map_id}/*.png")
    if not good: sys.exit(1)


# ---- remove --------------------------------------------------------------------------------------

def remove(args):
    if not args: raise SystemExit(__doc__)
    map_id = args[0]
    tracked = subprocess.run(["git", "ls-files", f"web/public/maps/{map_id}.json", f"data/{map_id}"], cwd=ROOT, capture_output=True, text=True).stdout
    if map_id in KEPT or tracked.strip(): raise SystemExit(f"FAIL {map_id} is committed to the repository: remove refuses. STOP and ask")
    src = open(AREA_PY).read()
    src2 = re.sub(rf'\n    "{re.escape(map_id)}": dict\(\n.*?\n    \),', "", src, count=1, flags=re.S)
    if src2 != src: open(AREA_PY, "w").write(src2); print("removed from tools/area.py")
    ts = open(MAPS_TS).read()
    ts2 = re.sub(rf'  \{{ id: "{re.escape(map_id)}",[^\n]*\n', "", ts, count=1)
    if ts2 != ts: open(MAPS_TS, "w").write(ts2); print("removed from web/src/maps.ts")
    maps = os.path.join(ROOT, "web", "public", "maps")
    for p in [os.path.join(maps, map_id), os.path.join(ROOT, "data", map_id), os.path.join(ROOT, "shots", map_id),
              os.path.join(maps, f"{map_id}.json"), *(os.path.join(maps, f"{map_id}-{s}.json") for s in SUFFIXES)]:
        if os.path.isdir(p): shutil.rmtree(p); print(f"deleted {os.path.relpath(p, ROOT)}/")
        elif os.path.exists(p): os.remove(p); print(f"deleted {os.path.relpath(p, ROOT)}")
    print(f"REMOVED {map_id} (the downloads in data/raw/{map_id} are kept; delete that folder too to free the space)")


def main():
    args = sys.argv[1:]
    commands = {"check": check, "find": find, "add": add, "build": build, "verify": verify, "shoot": shoot, "remove": remove}
    if not args or args[0] not in commands: raise SystemExit(__doc__)
    ensure_python()
    commands[args[0]](args[1:])


if __name__ == "__main__":
    main()
