"""Download everything a map with a wide area (the whole of Bath) is built from, from the public
sources, into the raw dir the builds read: the start of rebuilding the repository's copy of the
map data from scratch (tools/mapdata.py). For an ordinary rebuild none of this is needed:
tools/mapdata.py unpack gives the same data from the repository.

Usage: python3 -I tools/fetch.py <map> [<raw dir>] [--only overture,lidar,canopy,osm,fsa]

The raw dir is data/raw/<map>/wide unless given. In turn:
- overture: the Overture layers for the wide circle, at the release in area.py (tools/download.py);
- lidar: the Environment Agency's 1 m LIDAR Composite DTM, First Return DSM and Last Return DSM
  for every OS 5 km square the full-detail squares stand on (each a plain download of about 75 MB,
  unzipped into lidar/dtm/, lidar/dsm/ and lidar/last/; about 3 GB in all);
- canopy: the Meta / WRI canopy height tile over the map's centre (about 290 MB);
- osm, fsa: OpenStreetMap's businesses (and its streets' widths and pavements) and the Food Standards Agency's hygiene ratings
  (tools/osm.py, tools/fsa.py). These are the live data, so they will have changed since the copy
  in the repository was made.
The HM Land Registry parcels (INSPIRE Index Polygons) have to be fetched by hand, one zip per local
authority: `tools/parcels.py` converts the download to `parcels.geojson` in the wide dir (see
docs/new-area.md). They are optional: without them the partition build divides blocks by rule.
Files already there are left alone. The Mapzen terrain tiles are fetched by the builds as they
need them, and the energy certificates have to be downloaded by hand (it needs an account): see
docs/new-area.md, and put them in <raw dir>/epc/.

Then, to measure and pack it all (tools/mapdata.py):
  python3 -I tools/canal.py <map> <raw dir> web/public/maps/<map>-canal.json   (and railway.py)
  python3 -I tools/prep_tiles.py <map> <raw dir> web/public/maps/<map> --force --measure
  python3 -I tools/prep_wide.py <map> <raw dir> web/public/maps/<map>-wide.json --measure
  python3 -I tools/mapdata.py pack <map> <raw dir>
"""
import math, os, subprocess, sys, time, urllib.request, zipfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from area import area

TOOLS = os.path.dirname(os.path.abspath(__file__))
LAYERS = ["building", "segment", "water", "land_use", "land", "land_cover", "place", "infrastructure"]
LIDAR = "https://environment.data.gov.uk/tiles/collections/survey/{kind}/2022/1/{square}"
KINDS = {"dtm": "lidar_composite_dtm", "dsm": "lidar_composite_first_return_dsm", "last": "lidar_composite_last_return_dsm"}
CANOPY = "https://dataforgood-fb-data.s3.amazonaws.com/forests/v1/alsgedi_global_v6_float/chm/{q}.tif"
REACH = 250         # metres past the full-detail squares that the lidar is fetched for (they measure 210 m past their edges)


def os_square(e, n):
    """The OS 5 km square holding British National Grid metres (e, n), as the EA names it by its
    south-west corner (ST75NE is ST7555)."""
    e100, n100 = int(e // 100000), int(n // 100000)
    l1 = (19 - n100) - (19 - n100) % 5 + (e100 + 10) // 5
    l2 = (19 - n100) * 5 % 25 + e100 % 5
    letter = lambda v: chr(ord("A") + v + (1 if v > 7 else 0))      # (there is no I)
    return f"{letter(l1)}{letter(l2)}{int(e % 100000) // 5000 * 5:02d}{int(n % 100000) // 5000 * 5:02d}"


def lidar_squares(A):
    """Every OS 5 km square under the full-detail squares (tools/prep_tiles.py) or within REACH
    of them: what their buildings and trees are measured over."""
    from shapely.geometry import Point, box
    from lidar import bng_transformer
    from prep_tiles import CELLS
    lon0, lat0 = A.centre
    kx, ky = 111320 * math.cos(math.radians(lat0)), 110574
    G, size = A.squares, CELLS * A.squares.dx
    (fcx, fcy), R = A.field_centre, A.half
    circle = Point(fcx, fcy).buffer(R, 256)
    xs, ys = [], []
    for ti in range(math.floor((fcx - R - G.x0) / size), math.floor((fcx + R - G.x0) / size) + 1):
        for tj in range(math.floor((fcy - R - G.y0) / size), math.floor((fcy + R - G.y0) / size) + 1):
            x0, y0 = G.x0 + ti * size, G.y0 + tj * size
            if not box(x0, y0, x0 + size, y0 + size).intersects(circle): continue
            for k in range(41):
                f = k / 40 * (size + 2 * REACH) - REACH
                for x, y in ((x0 + f, y0 - REACH), (x0 + f, y0 + size + REACH), (x0 - REACH, y0 + f), (x0 + size + REACH, y0 + f)):
                    xs.append(x / kx + lon0); ys.append(y / ky + lat0)
    e, n = bng_transformer().transform(xs, ys)
    return sorted({os_square(a, b) for a, b in zip(e, n)})


def quadkey(lon, lat, z=9):
    n = 2 ** z
    x = int((lon + 180) / 360 * n)
    y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
    return "".join(str(((x >> i) & 1) + 2 * ((y >> i) & 1)) for i in range(z - 1, -1, -1))


def fetch(url, path, tries=4):
    tmp = path + ".part"
    for k in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=120) as r, open(tmp, "wb") as f:
                while True:
                    b = r.read(1 << 20)
                    if not b: break
                    f.write(b)
            break
        except OSError:
            # the EA's tile service now and then answers a square it has with "not found"
            if k == tries - 1: raise
            time.sleep(5 * 2 ** k)
    os.replace(tmp, path)


def main():
    args = sys.argv[1:]
    only = None
    if "--only" in args:
        k = args.index("--only"); only = set(args[k + 1].split(",")); del args[k:k + 2]
    map_id = args[0]
    raw = args[1] if len(args) > 1 else os.path.join(TOOLS, "..", "data", "raw", map_id, "wide")
    want = lambda s: only is None or s in only
    A = area(map_id, wide=True)
    os.makedirs(raw, exist_ok=True)
    def run(script, map_id, kind, path, *more):
        """A tool that writes path, run to a temporary name and renamed when it finishes, so a download
        that dies half way is never mistaken for a finished one."""
        part = path + ".part"
        subprocess.run([sys.executable, "-I", script, map_id, *([kind] if kind else []), part, *more], check=True)
        os.replace(part, path)
    if want("overture"):
        for t in LAYERS:
            path = os.path.join(raw, f"{t}.geojson")
            if not os.path.exists(path): run(os.path.join(TOOLS, "download.py"), map_id, t, path, "wide")
    if want("lidar"):
        squares = lidar_squares(A)
        print(f"lidar: {len(squares)} squares: {' '.join(squares)}")
        for sq in squares:
            for kind, name in KINDS.items():
                folder = os.path.join(raw, "lidar", kind)
                os.makedirs(folder, exist_ok=True)
                done = os.path.join(folder, f".{sq}")
                if os.path.exists(done): continue
                z = os.path.join(raw, "lidar", f"{sq}-{kind}.zip")
                if not os.path.exists(z): fetch(LIDAR.format(kind=name, square=sq), z)
                with zipfile.ZipFile(z) as f:
                    for n in f.namelist():
                        if n.lower().endswith(".tif"):
                            with open(os.path.join(folder, os.path.basename(n)), "wb") as out: out.write(f.read(n))
                os.remove(z)
                open(done, "w").close()
                print(f"lidar: {sq} {kind}")
    if want("canopy"):
        q = quadkey(*A.centre)
        os.makedirs(os.path.join(raw, "canopy"), exist_ok=True)
        path = os.path.join(raw, "canopy", f"{q}.tif")
        if not os.path.exists(path): fetch(CANOPY.format(q=q), path); print(f"canopy: {q}")
    if want("osm") and not os.path.exists(os.path.join(raw, "osm.geojson")):
        run(os.path.join(TOOLS, "osm.py"), map_id, None, os.path.join(raw, "osm.geojson"), "wide")
    if want("osm") and not os.path.exists(os.path.join(raw, "osm-roads.geojson")):
        # the streets' widths, lanes and pavements, for fitting the streets (tools/roadwidth.py)
        run(os.path.join(TOOLS, "osm.py"), map_id, None, os.path.join(raw, "osm-roads.geojson"), "wide", "roads")
    if want("fsa") and not os.path.exists(os.path.join(raw, "fsa.geojson")):
        run(os.path.join(TOOLS, "fsa.py"), map_id, None, os.path.join(raw, "fsa.geojson"), "wide")
    if not os.path.exists(os.path.join(raw, "epc", "certificates.csv")):
        print(f"epc: download the energy certificates and OS Open UPRN by hand into {os.path.join(raw, 'epc')} (see docs/new-area.md)")


if __name__ == "__main__":
    main()
