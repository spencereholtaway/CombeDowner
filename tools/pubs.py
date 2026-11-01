"""List every pub inside a map's force field, for the pause menu's "Go to a pub", with its food
hygiene rating where the Food Standards Agency has one.

Usage: python3 -I tools/pubs.py <map> <dir with the .geojson downloads> <out.json>

For a map with a wider circle round it (see area.py) the dir is data/raw/<map>/wide, and the list
covers the whole of that force field; otherwise it is data/raw/<map>. It reads:
- place.geojson: Overture places (tools/download.py <map> place ... [wide]). Pubs, gastropubs,
  Irish pubs and inns, tidied up: no brand or campaign pages, no ", Bath" on the end of names, and
  one entry where Overture has the same pub twice.
- osm.geojson (optional): OpenStreetMap (tools/osm.py <map> ... wide). Its pubs that Overture
  hasn't got as one, such as the Bell on Walcot Street, which Overture calls a music venue.
- fsa.geojson (optional): FSA hygiene ratings (tools/fsa.py <map> ... [wide]). A pub gets the
  rating of the FSA entry nearby with the same name, or of the one pub or bar right next to it.
- the built detailed map (web/public/maps/<map>.json): the pubs with signs there come first, as
  they're placed better, and an Overture pub that's one of them is left out.
- its squares out in town (web/public/maps/<map>/, from prep_tiles.py): a listed pub with its
  sign there is put on the pavement in front of the sign, like the ones in the detailed map. Only
  the pubs listed already: the squares sign bars and clubs as pubs too.

Writes {"pb": [[x, y, name, rating, angle], ...]}, x and y in metres east and north of the map's
centre. For a pub with a sign in the detailed map, (x, y) is the pavement out front and angle the
way the sign faces; for the rest, (x, y) is the pub itself and angle is null, and the game finds
the street outside. rating is 0 to 5, or null where there isn't one (not yet inspected, exempt,
or no FSA download). FSA data: Open Government Licence.
"""
import json, math, os, re, sys
import shapely
from shapely.geometry import Point, shape
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from area import area
from shops import same

PUB_CATS = {"pub", "gastropub", "irish_pub", "inn"}
MIN_CONFIDENCE = 0.7
# Overture places filed as pubs that aren't one: brands, breweries' offices, a shop, the pub
# company, a Wetherspoon listed by its brand (it's the King of Wessex), and one that's in Paulton
NOT_PUBS = {"budweiser", "marston's", "sizzler", "cross manufacturing company (1938) ltd.", "abbey shop",
            "the bath pub company", "wetherspoon", "red lion paulton", "beneath", "market", "peacock"}
SIGN_NEAR = 80.0      # metres: how far a pub's sign out in town can be from where it's listed
SAME_PUB = 500.0      # metres: two entries this close with the same name are one pub (Overture has the Ram twice)
OSM_SAME = 25.0       # metres: an OpenStreetMap pub this close to one already listed is it, whatever the
                      # spelling (Overture's "Barley Mo Bar" is OSM's Barley Mow)
FSA_NEAR = 80.0       # metres: how far an FSA entry's point can be from the pub's
FSA_NEXT_DOOR = 20.0  # metres: an unnamed match must be a pub or bar this close
FSA_PUB = "Pub/bar/nightclub"


def tidy(name):
    """A pub's name as it's painted on the sign, not as a listing has it."""
    name = re.split(r",", name)[0].strip()
    name = re.sub(r"(\s+(bath|pub & rooms|pub & dining rooms|pub & kitchen|pub))+$", "", name, flags=re.I)
    return re.sub(r"'S\b", "'s", name)


def rating(v):
    return int(v) if str(v) in {"0", "1", "2", "3", "4", "5"} else None


if __name__ == "__main__":
    map_id, src, out = sys.argv[1], sys.argv[2], sys.argv[3]
    A = area(map_id)
    wide = "wide" in A.__dict__
    F = area(map_id, wide=True) if wide else A
    lon0, lat0 = A.centre
    kx, ky = 111320 * math.cos(math.radians(lat0)), 110574
    proj = lambda lon, lat: ((lon - lon0) * kx, (lat - lat0) * ky)
    fx, fy = F.field_centre
    inside = lambda x, y: math.hypot(x - fx, y - fy) < F.field - 5

    # the signed pubs in the detailed map (for Bath, the village's nine squares, 0-2 each way): the
    # pavement out front, facing the sign
    maps = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web", "public", "maps")
    core = json.load(open(os.path.join(maps, f"{map_id}.json")))
    signs = core.get("sh", [])
    if "t" not in core:
        for ti in range(3):
            for tj in range(3):
                q = os.path.join(maps, map_id, f"{ti}_{tj}.json")
                if os.path.exists(q): signs += json.load(open(q)).get("sh", [])
    tiles = os.path.join(maps, map_id)
    built = [core] + [json.load(open(os.path.join(tiles, f))) for f in sorted(os.listdir(tiles))
                      if re.fullmatch(r"-?\d+_-?\d+\.json", f)] if os.path.isdir(tiles) else [core]
    homes = [shapely.Polygon(b["r"][0]).buffer(0) for m in built for b in m.get("bl") or [] if len(b["r"][0]) >= 3]
    htree = shapely.STRtree(homes)

    def out_front(x, y, a):
        """The pavement 3 m out from the sign, or nearer where another building stands closer than that
        across a yard, so the door the game puts there isn't indoors."""
        for d in (3.0, 2.5, 2.0, 1.5, 1.0, 0.6):
            q = Point(x + math.sin(a) * d, y - math.cos(a) * d)
            if not any(homes[int(k)].buffer(-0.3).contains(q) for k in htree.query(q)): break
        return q.x, q.y

    pubs = []
    for x, y, _g, a, _w, name, style in signs:
        if style != "pub" or not name or any(p["name"] == name for p in pubs): continue
        ox, oy = out_front(x, y, a)
        pubs.append(dict(name=name, x=ox, y=oy, px=x, py=y, a=a, conf=2.0))
    signed = len(pubs)

    # Overture's pubs, most confident first so a duplicate keeps the better entry
    found = []
    for f in json.load(open(os.path.join(src, "place.geojson")))["features"]:
        p = f["properties"]
        cat = (p.get("taxonomy") or {}).get("primary") or (p.get("categories") or {}).get("primary")
        raw = (p.get("names") or {}).get("primary")
        if cat not in PUB_CATS or not raw or (p.get("confidence") or 0) < MIN_CONFIDENCE: continue
        if p.get("operating_status") == "permanently_closed": continue
        if raw.lower() in NOT_PUBS or raw.lower().startswith("save "): continue
        x, y = proj(*f["geometry"]["coordinates"][:2])
        if inside(x, y): found.append(dict(name=tidy(raw), x=x, y=y, px=x, py=y, a=None, conf=p["confidence"]))
    for q in sorted(found, key=lambda q: -q["conf"]):
        if any(same(q["name"], p["name"]) and math.hypot(q["x"] - p["px"], q["y"] - p["py"]) < SAME_PUB for p in pubs): continue
        pubs.append(q)

    # OpenStreetMap's pubs that Overture has filed as something else, or left out
    osm_path, from_osm = os.path.join(src, "osm.geojson"), 0
    if os.path.exists(osm_path):
        for f in json.load(open(osm_path))["features"]:
            p = f["properties"]
            if p.get("amenity") != "pub" or not p.get("name") or p["name"].lower() in NOT_PUBS: continue
            g = shape(f["geometry"])
            x, y = proj(*(g.centroid if g.geom_type == "Point" else g.representative_point()).coords[0])
            name = tidy(p["name"])
            if not inside(x, y) or any(math.hypot(x - q["px"], y - q["py"]) < (SAME_PUB if same(name, q["name"]) else OSM_SAME)
                                       for q in pubs): continue
            pubs.append(dict(name=name, x=x, y=y, px=x, py=y, a=None, conf=1.0))
            from_osm += 1

    # pubs signed in the squares out in town: out front of the sign, not wherever the listing put them
    moved = 0
    signs = []
    for f in sorted(os.listdir(tiles)) if os.path.isdir(tiles) else []:
        if f.endswith(".json"):
            signs += [s for s in json.load(open(os.path.join(tiles, f))).get("sh", []) if s[6] == "pub" and s[5]]
    for p in pubs:
        if p["a"] is not None: continue
        near = sorted((math.hypot(x - p["px"], y - p["py"]), x, y, a) for x, y, _g, a, _w, name, _s in signs
                      if same(name, p["name"]) and math.hypot(x - p["px"], y - p["py"]) < SIGN_NEAR)
        if not near: continue
        _d, x, y, a = near[0]
        ox, oy = out_front(x, y, a)
        p.update(x=ox, y=oy, a=a)
        moved += 1

    # hygiene ratings
    fsa_path, rated = os.path.join(src, "fsa.geojson"), 0
    fsa = []
    if os.path.exists(fsa_path):
        for f in json.load(open(fsa_path))["features"]:
            x, y = proj(*f["geometry"]["coordinates"][:2])
            fsa.append((x, y, f["properties"]))
    for p in pubs:
        near = [(math.hypot(x - p["px"], y - p["py"]), e) for x, y, e in fsa]
        near = sorted(((d, e) for d, e in near if d < FSA_NEAR), key=lambda de: de[0])   # (two at the same distance stay in order)
        named = [e for d, e in near if same(e.get("BusinessName"), p["name"])]
        bars = [e for d, e in near if d < FSA_NEXT_DOOR and e.get("BusinessType") == FSA_PUB]
        match = named[0] if named else bars[0] if len(bars) == 1 else None
        p["rating"] = rating(match.get("RatingValue")) if match else None
        rated += p["rating"] is not None

    r1 = lambda v: round(v, 1)
    pb = [[r1(p["x"]), r1(p["y"]), p["name"], p["rating"], None if p["a"] is None else round(p["a"], 3)] for p in pubs]
    json.dump(dict(pb=pb), open(out, "w"), separators=(",", ":"), ensure_ascii=False)
    print(f"pubs: {len(pb)} ({signed} signed in the detailed map, {moved} out in town, {from_osm} only in OpenStreetMap), {rated} with a hygiene rating"
          + ("" if fsa else " (no fsa.geojson)"))
