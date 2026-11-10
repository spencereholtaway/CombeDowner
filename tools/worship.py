"""Which buildings are built as churches, from what the open data says of their form.

Usage: python3 -I tools/worship.py <map>      fetch afresh into data/<map>/worship.json

A building is drawn as a church (`buildings.py`) when OpenStreetMap says it was built as one:
`building=church|chapel|cathedral`, `historic=church`, `disused:amenity=place_of_worship`, or a
building tagged `amenity=place_of_worship` by a Christian congregation. A church that is now a
community centre or an arts centre keeps its form but usually loses those tags (St Mark's in
Widcombe is `amenity=community_centre`, `building=yes`). OpenStreetMap often links such a building
to Wikidata, which still says what it is: so each OSM building's `wikidata` item is looked up, and
those that are a church building (Q16970, or anything Wikidata counts as one: a chapel, a cathedral)
are kept here. Many chapels carry neither tags nor a link (Walcot Chapel, Chapel Arts Centre), so a
building whose own name calls it a church, chapel, abbey and so on counts too, unless the name is
also a street, a hall or a house: Chapel Row is a terrace and Church Hall is not a church.

The answer is kept in the repository (a few hundred bytes), so the map builds without the network.
"""
import json, lzma, os, re, sys, time, urllib.parse, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mapdata import data_dir

CHURCH_BUILDING, BUILDING = "Q16970", "Q41176"
FORM_TAGS = (("building", ("church", "chapel", "cathedral")), ("historic", ("church",)),
             ("disused:amenity", ("place_of_worship",)))
NAME_WORDS = {"church", "chapel", "cathedral", "abbey", "minster", "kirk", "kerk", "kirche",
              "kapelle", "dom", "eglise", "église", "chapelle", "cathédrale", "abbaye", "iglesia", "capilla",
              "catedral", "abadia", "abadía", "igreja", "capela", "sé", "chiesa", "cappella", "cattedrale",
              "abbazia", "basilica", "basiliek", "kathedraal", "kapel", "moskee"}
NOT_CHURCH_WORDS = {"row", "road", "street", "lane", "close", "court", "gardens", "terrace", "place", "walk", "hill",
                    "mews", "yard", "avenue", "drive", "way", "square", "passage", "steps", "path", "green",
                    "view", "hall", "house", "cottage", "cottages", "farm", "school", "primary", "nursery",
                    "hotel", "inn", "pub", "mill", "flats", "lodge", "rooms", "vicarage", "rectory", "manse",
                    "parish", "office", "car", "park", "garage", "shop", "cafe", "café", "restaurant", "stores",
                    "gate", "rd", "ln", "deli", "brewery", "ales", "towers", "tower", "mansions", "clinic", "villas", "buildings", "bridge", "works", "barn"}
BATCH = 200
AGENT = "CombeDowner-map-build/1.0 (https://combedowner.com)"


def path(map_id):
    return os.path.join(data_dir(map_id), "worship.json")


def churches(map_id):
    """The Wikidata items of the map's buildings that are churches, as a set (empty if never fetched)."""
    p = path(map_id)
    return set(json.load(open(p))["church"]) if os.path.exists(p) else set()


def name_says_church(name):
    """Whether a building's own name calls it a church (St Mary's Church, Walcot Chapel, Kerk van ...)."""
    words = re.findall(r"[^\W\d_]+", (name or "").lower())
    return any(w in NAME_WORDS for w in words) and not any(w in NOT_CHURCH_WORDS for w in words)


def built_as_church(tags, wikidata=frozenset()):
    """Whether an OpenStreetMap feature's tags say it is a building built as a church."""
    if any(tags.get(k) in v for k, v in FORM_TAGS):
        return True
    if tags.get("building") in (None, "no"):
        return False
    if name_says_church(tags.get("name")):
        return True
    if tags.get("amenity") == "place_of_worship" and tags.get("religion", "christian") == "christian":
        return True
    return tags.get("wikidata") in wikidata


def fetch(map_id):
    feats = json.load(lzma.open(os.path.join(data_dir(map_id), "osm.geojson.xz")))["features"]
    ids = sorted({f["properties"]["wikidata"] for f in feats
                  if f["properties"].get("wikidata", "").startswith("Q") and f["properties"].get("building") not in (None, "no")})
    found = set()
    for k in range(0, len(ids), BATCH):
        values = " ".join(f"wd:{q}" for q in ids[k:k + BATCH])
        # (and nothing else it is said to be is another kind of building: an almshouse with a chapel
        # in it is linked to both, and is not built as a church)
        query = (f"SELECT ?item WHERE {{ VALUES ?item {{ {values} }} ?item wdt:P31/wdt:P279* wd:{CHURCH_BUILDING} . "
                 f"FILTER NOT EXISTS {{ ?item wdt:P31 ?o . ?o wdt:P279* wd:{BUILDING} . "
                 f"FILTER NOT EXISTS {{ ?o wdt:P279* wd:{CHURCH_BUILDING} }} }} }}")
        req = urllib.request.Request("https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": query}),
                                     headers={"Accept": "application/sparql-results+json", "User-Agent": AGENT})
        rows = json.load(urllib.request.urlopen(req, timeout=120))["results"]["bindings"]
        found |= {r["item"]["value"].rsplit("/", 1)[1] for r in rows}
        time.sleep(1)
    out = dict(fetched=time.strftime("%Y-%m-%d"), looked_up=len(ids), church=sorted(found))
    open(path(map_id), "w").write(json.dumps(out, indent=0) + "\n")
    print(f"{map_id}: {len(found)} of {len(ids)} OpenStreetMap buildings with a Wikidata item are churches")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    fetch(sys.argv[1])
