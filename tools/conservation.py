"""Fetch the conservation areas round a game map from planning.data.gov.uk.

Usage: python3 -I tools/conservation.py <map> <out.geojson> [wide]

A conservation area is a part of a town its council has designated for its special architectural or
historic interest: the old village, the Georgian squares, the Victorian high street. The build
(buildings.classify) takes one as the area's old core wherever no zone in area.py says otherwise,
and builds its houses in what the old buildings round them are made of. England only.

Read from the open API of planning.data.gov.uk (dataset conservation-area, no account). The
dataset gathers each council's own outlines with Historic England's, so some areas come twice:
an outline lying almost wholly over one already kept is left out. Outlines are cut to the map's
box. Each feature has the area's name and its entity number on the site.
Data: Historic England and the local planning authorities, via planning.data.gov.uk, Open
Government Licence v3; data/combe-down/README.md has the attribution.
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request

import shapely
from shapely.geometry import box, mapping, shape

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from area import area

API = "https://www.planning.data.gov.uk/entity.geojson"
UA = {"User-Agent": "CombeDowner map builder (https://combedowner.com)"}
SAME = 0.8          # of the smaller outline lying in one already kept: the same area mapped twice


def get(url, tries=4):
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                return json.load(r)
        except OSError:
            if k == tries - 1: raise
            time.sleep(5 * 2 ** k)


def fetch(bbox, dataset="conservation-area"):
    W, S, E, N = bbox
    out, offset = [], 0
    while True:
        q = dict(dataset=dataset, geometry=f"POLYGON(({W} {S},{E} {S},{E} {N},{W} {N},{W} {S}))",
                 geometry_relation="intersects", limit=100, offset=offset)
        got = get(API + "?" + urllib.parse.urlencode(q)).get("features", [])
        out += got
        if len(got) < 100: return out
        offset += len(got)


def rounded(g):
    return shapely.set_precision(g, 1e-6)


def main(argv):
    A = area(argv[0], wide="wide" in argv[2:])
    frame = box(*A.bbox)
    kept = []
    for f in sorted(fetch(A.bbox), key=lambda f: int(f["properties"].get("entity") or 0)):
        p, g = f["properties"], f.get("geometry")
        if not g or p.get("end-date"): continue
        g = rounded(shape(g).buffer(0).intersection(frame))
        if g.is_empty or g.area <= 0: continue
        if any(g.intersection(k).area >= SAME * min(g.area, k.area) for k, _ in kept): continue
        kept.append((g, {"name": p.get("name") or "", "entity": int(p.get("entity") or 0)}))
    feats = [{"type": "Feature", "geometry": mapping(g), "properties": props} for g, props in kept]
    text = '{"type":"FeatureCollection","features":[' + \
        ",\n".join(json.dumps(f, separators=(",", ":"), ensure_ascii=False) for f in feats) + "]}\n"
    with open(argv[1], "w", encoding="utf-8") as fh:
        fh.write(text)
    print(f"conservation: {len(feats)} areas: {', '.join(p['name'] for _, p in kept)}")


if __name__ == "__main__":
    main(sys.argv[1:])
