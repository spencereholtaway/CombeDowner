"""Fetch the 2021 Census's accommodation types for every output area round a game map.

Usage: python3 -I tools/census.py <map> <out.geojson> [wide]

An output area is the smallest piece the census is published for, about 125 households. Table
TS044 says how many of each area's households live in a detached, semi-detached or terraced house,
a purpose-built block of flats, a converted house or other building, over a shop or in a caravan.
The build (buildings.classify) takes that mix as what to expect of the houses in each area wherever
the map data and the surveys don't say. England and Wales only: elsewhere there are no output
areas and the file has none.

Read from two public services, both open (no account):
- the output areas' outlines: ONS Open Geography, Output Areas (December 2021) Boundaries EW BFC;
- TS044 for those areas: Nomis, dataset NM_2062_1.
Each feature is one output area, its code ("oa") and its households ("hh") in the order of TYPES.
Data: Office for National Statistics, Open Government Licence v3; data/combe-down/README.md has
the attribution.
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from area import area

OUTLINES = ("https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/"
            "Output_Areas_2021_EW_BFC_V8/FeatureServer/0/query")
TS044 = "https://www.nomisweb.co.uk/api/v01/dataset/NM_2062_1.data.csv"
# TS044's categories 1 to 8, in order: what each area's "hh" counts
TYPES = ("detached", "semi", "terraced", "flats", "converted_house", "converted_other", "commercial", "caravan")
UA = {"User-Agent": "CombeDowner map builder (https://combedowner.com)"}


def get(url, tries=4):
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                return r.read()
        except OSError:
            if k == tries - 1: raise
            time.sleep(5 * 2 ** k)


def outlines(bbox):
    out, offset = [], 0
    while True:
        q = dict(f="geojson", where="1=1", geometry=",".join(str(v) for v in bbox), geometryType="esriGeometryEnvelope",
                 inSR=4326, spatialRel="esriSpatialRelIntersects", outFields="OA21CD", outSR=4326,
                 geometryPrecision=6, orderByFields="OA21CD", resultOffset=offset, resultRecordCount=1000)
        d = json.loads(get(OUTLINES + "?" + urllib.parse.urlencode(q)))
        got = d.get("features", [])
        out += got
        if len(got) < 1000 and not d.get("properties", {}).get("exceededTransferLimit"):
            return out
        offset += len(got)


def households(codes):
    hh = {c: [0] * len(TYPES) for c in codes}
    for k in range(0, len(codes), 150):
        q = dict(geography=",".join(codes[k:k + 150]), measures=20100, select="geography_code,c2021_acctype_9,obs_value")
        lines = get(TS044 + "?" + urllib.parse.urlencode(q)).decode().splitlines()[1:]
        for line in lines:
            code, cat, n = (v.strip('"') for v in line.split(","))
            if code in hh and 1 <= int(cat) <= len(TYPES): hh[code][int(cat) - 1] = int(n)
    return hh


def main(argv):
    A = area(argv[0], wide="wide" in argv[2:])
    feats = outlines(A.bbox)
    codes = sorted({f["properties"]["OA21CD"] for f in feats})
    hh = households(codes) if codes else {}
    keep = [{"type": "Feature", "geometry": f["geometry"], "properties": {"oa": f["properties"]["OA21CD"], "hh": hh[f["properties"]["OA21CD"]]}}
            for f in sorted(feats, key=lambda f: f["properties"]["OA21CD"]) if sum(hh[f["properties"]["OA21CD"]])]
    text = '{"type":"FeatureCollection","features":[' + \
        ",\n".join(json.dumps(f, separators=(",", ":")) for f in keep) + "]}\n"
    with open(argv[1], "w", encoding="utf-8") as fh:
        fh.write(text)
    total = [sum(f["properties"]["hh"][i] for f in keep) for i in range(len(TYPES))]
    print(f"census: {len(keep)} output areas, {sum(total)} households: " +
          ", ".join(f"{t} {100 * n / max(1, sum(total)):.0f}%" for t, n in zip(TYPES, total)))


if __name__ == "__main__":
    main(sys.argv[1:])
