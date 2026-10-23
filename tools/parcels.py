"""Convert HM Land Registry's INSPIRE Index Polygons into a wide-area layer for a game map.

Usage: python3 -I tools/parcels.py <map> <in.zip or .gml> <out.geojson> [wide]

Writes the registered freehold property extents that touch the map's area, as the other wide
`.geojson` layers are kept (tools/mapdata.py). The download is one zip per local authority from
use-land-property-data.service.gov.uk/datasets/inspire/download (`<Council name>.zip`, holding
`Land_Registry_Cadastral_Parcels.gml`): a plain download, no sign-in. The GML is in British
National Grid (EPSG:27700, to the centimetre), so the polygons are reprojected to the lon/lat the
rest of the map is in with pyproj, whose OSTN15 grid is what gives the 1 m agreement with the
footprints; PROJ's fallback (a 2 m Helmert) would put every boundary two metres out.

The polygons' extents are *indicative*, not the legal boundary (only an individual title plan shows
that), and the licence forbids deriving building footprints from them, so the build reads them only
where it divides plots (tools/partition/plots.py). Data: HM Land Registry INSPIRE Index Polygons,
Open Government Licence v3; data/combe-down/README.md has the two attributions the licence
requires.
"""
import json, math, os, sys, zipfile
import xml.etree.ElementTree as ET

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from area import area

GML = "{http://www.opengis.net/gml/3.2}"
LR = "{www.landregistry.gov.uk}"
WFS = "{http://www.opengis.net/wfs/2.0}"
PARTS = "{http://www.opengis.net/gml/3.2}"
DEC = 7                  # decimal places of lon/lat kept: about a centimetre, the GML's own precision


def gml_stream(path):
    """The GML opened for reading, from the download's zip or from the file itself."""
    if zipfile.is_zipfile(path):
        z = zipfile.ZipFile(path)
        name = next(n for n in z.namelist() if n.lower().endswith(".gml"))
        return z.open(name)
    return open(path, "rb")


def members(stream):
    """Every polygon in the GML, one at a time, as (INSPIRE ID, [[(e, n), ...] rings]): read with
    iterparse so the 100 MB file is never all in memory."""
    for _, el in ET.iterparse(stream, events=("end",)):
        if el.tag == WFS + "member":
            el.clear()
            continue
        if not el.tag.endswith("PREDEFINED"):
            continue
        rings = []
        for pl in el.iter(GML + "posList"):
            v = [float(t) for t in (pl.text or "").split()]
            rings.append(list(zip(v[0::2], v[1::2])))
        yield el.findtext(LR + "INSPIREID"), rings
        el.clear()


def bounds(rings):
    xs = [p[0] for r in rings for p in r]
    ys = [p[1] for r in rings for p in r]
    return min(xs), min(ys), max(xs), max(ys)


def main():
    from pyproj import Transformer
    src = area(sys.argv[1], wide=sys.argv[4:] == ["wide"])
    in_path, out_path = sys.argv[2], sys.argv[3]
    from lidar import bng_transformer
    # (it stops the build if PROJ can't reach the OSTN15 grid, which the reverse needs as well)
    to_bng = bng_transformer()
    to_wgs = Transformer.from_crs("EPSG:27700", "EPSG:4326", always_xy=True)
    W, S, E, N = src.bbox
    # the bbox's envelope in the grid's metres: a first, conservative cut before reprojecting, so
    # the polygons of the rest of the county are never transformed (their edges are monotonic in
    # both longitude and latitude, so the four corners' envelope covers the whole area)
    es, ns = to_bng.transform([W, E, W, E], [S, S, N, N])
    bw, bs, be, bn = min(es), min(ns), max(es), max(ns)

    feats, seen, tried = [], 0, 0
    for insp, rings in members(gml_stream(in_path)):
        tried += 1
        if not rings:
            continue
        x0, y0, x1, y1 = bounds(rings)
        if x1 < bw or x0 > be or y1 < bs or y0 > bn:
            continue
        out = []
        for r in rings:
            lons, lats = to_wgs.transform([p[0] for p in r], [p[1] for p in r])
            out.append([[round(a, DEC), round(b, DEC)] for a, b in zip(lons, lats)])
        lx = [p[0] for r in out for p in r]
        ly = [p[1] for r in out for p in r]
        if max(lx) < W or min(lx) > E or max(ly) < S or min(ly) > N:
            continue
        seen += 1
        feats.append({"id": insp, "type": "Feature", "geometry": {"type": "Polygon", "coordinates": out},
                      "properties": {"inspire_id": insp}})

    text = '{"type":"FeatureCollection","features":[' + \
        ",\n".join(json.dumps(f, separators=(",", ":"), ensure_ascii=False) for f in feats) + "]}\n"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"parcels: {seen} of {tried} polygons touch the area -> {out_path} "
          f"({os.path.getsize(out_path) / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
