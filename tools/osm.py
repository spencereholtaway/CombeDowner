"""Download OpenStreetMap businesses and named buildings for a game map's bounding box.

Usage: python3 -I tools/osm.py <map> <out.geojson> [wide] [roads | bridges]

With "wide" on the end it fetches the map's wider circle (see area.py) instead, for the tiles.
With "roads" it fetches the streets instead (tools/prep_map.py reads osm-roads.geojson beside the
other layers): every way tagged highway, with only the tags that say how wide it is and whether it
has pavements (lanes, width, sidewalk), as lines.
With "bridges" it fetches the bridges instead (osm-bridges.geojson, read by the partition's writer):
every way tagged bridge (a street's, a path's, the railway's or the canal's), with only the tags that
say what kind of bridge it is (bridge:structure, material, layer and what it carries), as lines, and
every bridge's outline (man_made=bridge) as a polygon.

Keeps every node, way and multipolygon tagged shop, amenity, office, craft, healthcare, tourism or
leisure, or a building with a name. Nodes become points, closed ways polygons; tags are kept as
the feature's properties, plus "osm" ("node/123"). OpenStreetMap is mapped by locals, usually on
the building the business is in, so it places shops better than Overture's places do.

Tries the Overpass API first, which can filter on the server. Some networks block it, so it falls
back to the main API's map call (api.openstreetmap.org/api/0.6/map), which returns everything in a
small box: the bounding box is fetched in tiles under its 50,000-node limit and filtered here.
Data (c) OpenStreetMap contributors, ODbL.
"""
import json, os, sys, time, urllib.parse, urllib.request
import xml.etree.ElementTree as ET
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from area import area

KEYS = ("shop", "amenity", "office", "craft", "healthcare", "tourism", "leisure")
UA = {"User-Agent": "CombeDowner map builder (github.com/danturn/CombeDowner)"}
TILE = 0.008     # degrees: a tile of the main API's map call


def get(url, data=None, timeout=180):
    req = urllib.request.Request(url, data=data, headers=UA)
    return urllib.request.urlopen(req, timeout=timeout).read()


ROAD_TAGS = ("highway", "name", "lanes", "width", "est_width", "sidewalk", "sidewalk:both", "sidewalk:left", "sidewalk:right", "oneway")
BRIDGE_TAGS = ("bridge", "bridge:structure", "bridge:support", "material", "layer", "highway", "railway",
               "waterway", "man_made", "name", "bridge:name")
ROADS = False
BRIDGES = False


def wanted(tags):
    if ROADS: return "highway" in tags
    if BRIDGES: return tags.get("bridge", "no") != "no" or tags.get("man_made") == "bridge"
    return any(k in tags for k in KEYS) or ("building" in tags and "name" in tags)


def keep(tags):
    if BRIDGES: return {k: v for k, v in tags.items() if k in BRIDGE_TAGS}
    return {k: v for k, v in tags.items() if k in ROAD_TAGS} if ROADS else tags


def overpass(W, S, E, N):
    b = f"{S},{W},{N},{E}"
    sel = f'way["highway"]({b});' if ROADS else f'way["bridge"]["bridge"!="no"]({b});way["man_made"="bridge"]({b});' if BRIDGES else "".join(f'nwr["{k}"]({b});' for k in KEYS) + f'nwr["building"]["name"]({b});'
    q = f"[out:json][timeout:120];({sel});out geom tags;"
    js = json.loads(get("https://overpass-api.de/api/interpreter", urllib.parse.urlencode({"data": q}).encode()))
    feats = []
    for e in js["elements"]:
        tags = e.get("tags", {})
        if e["type"] == "node": geom = {"type": "Point", "coordinates": [e["lon"], e["lat"]]}
        elif e["type"] == "way" and e.get("geometry"):
            ring = [[p["lon"], p["lat"]] for p in e["geometry"]]
            geom = {"type": "Polygon", "coordinates": [ring]} if ring[0] == ring[-1] and len(ring) > 3 else \
                   {"type": "LineString", "coordinates": ring}
        elif e["type"] == "relation":
            rings = [[[p["lon"], p["lat"]] for p in m["geometry"]] for m in e.get("members", [])
                     if m.get("role") == "outer" and m.get("geometry")]
            rings = [r for r in rings if r[0] == r[-1] and len(r) > 3]
            if not rings: continue
            geom = {"type": "MultiPolygon", "coordinates": [[r] for r in rings]}
        else: continue
        if ROADS or (BRIDGES and tags.get("man_made") != "bridge"): geom = dict(geom, type="LineString", coordinates=[[p["lon"], p["lat"]] for p in e["geometry"]]) if e["type"] == "way" else None
        if geom: feats.append(dict(type="Feature", geometry=geom, properties={**keep(tags), "osm": f"{e['type']}/{e['id']}"}))
    return feats


def main_api(W, S, E, N):
    nodes, ways, feats, seen = {}, {}, [], set()
    tiles = []
    x = W
    while x < E:
        y = S
        while y < N:
            tiles.append((x, y, min(x + TILE, E), min(y + TILE, N))); y += TILE
        x += TILE
    for i, (w, s, e, n) in enumerate(tiles):
        for tries in range(4):
            try:
                root = ET.fromstring(get(f"https://api.openstreetmap.org/api/0.6/map?bbox={w},{s},{e},{n}")); break
            except Exception as ex:
                if tries == 3: raise
                print(f"tile {i}: {ex}, retrying"); time.sleep(5 * 2 ** tries)
        for el in root:
            tags = {t.get("k"): t.get("v") for t in el.findall("tag")}
            if el.tag == "node":
                nodes[el.get("id")] = (float(el.get("lon")), float(el.get("lat")))
                if wanted(tags) and not ROADS: feats.append(("node", el.get("id"), tags))
            elif el.tag == "way":
                ways[el.get("id")] = [nd.get("ref") for nd in el.findall("nd")]
                if wanted(tags): feats.append(("way", el.get("id"), tags))
            elif el.tag == "relation" and tags.get("type") == "multipolygon" and wanted(tags):
                feats.append(("relation", el.get("id"), {**tags, "_outer": [m.get("ref") for m in el.findall("member")
                                                                              if m.get("type") == "way" and m.get("role") == "outer"]}))
        print(f"tile {i + 1}/{len(tiles)}: {len(feats)} features so far")
        time.sleep(1)       # be gentle with the main API
    out = []
    ring = lambda wid: [list(nodes[r]) for r in ways.get(wid, []) if r in nodes]
    for kind, id_, tags in feats:
        if (kind, id_) in seen: continue          # features on tile edges come back twice
        seen.add((kind, id_))
        if kind == "node": geom = {"type": "Point", "coordinates": list(nodes[id_])}
        elif kind == "way":
            r = ring(id_)
            if len(r) < 2: continue
            geom = {"type": "Polygon", "coordinates": [r]} if r[0] == r[-1] and len(r) > 3 and not ROADS and not (BRIDGES and tags.get("man_made") != "bridge") else {"type": "LineString", "coordinates": r}
        else:
            rings = [r for r in map(ring, tags.pop("_outer")) if len(r) > 3 and r[0] == r[-1]]
            if not rings: continue
            geom = {"type": "MultiPolygon", "coordinates": [[r] for r in rings]}
        out.append(dict(type="Feature", geometry=geom, properties={**keep(tags), "osm": f"{kind}/{id_}"}))
    return out


if __name__ == "__main__":
    ROADS = "roads" in sys.argv[3:]
    BRIDGES = "bridges" in sys.argv[3:]
    A, out = area(sys.argv[1], wide="wide" in sys.argv[3:]), sys.argv[2]
    t = time.time()
    try:
        feats, via = overpass(*A.bbox), "Overpass"
    except Exception as ex:
        print(f"Overpass unavailable ({ex}); using the main API")
        feats, via = main_api(*A.bbox), "the main API"
    json.dump({"type": "FeatureCollection", "features": feats}, open(out, "w"))
    print(f"osm: {len(feats)} features via {via} in {time.time() - t:.0f}s")
