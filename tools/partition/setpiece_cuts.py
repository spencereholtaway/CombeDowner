"""Where a square's street faces are cut for the set pieces that fill their outlines.

A set piece marked `fills` in the game's table (web/src/landmarks/setpieces.ts) draws everything
inside its outline, out to the outline's edge, so the square's faces are cut along it here and the
two meet edge to edge, rather than the game taking out whole triangles and leaving a ragged strip
of the map's verge or pavement between them. A set piece that fits its outline to the street (the
Royal Crescent's flags run out to the kerb) is fitted to the carriageway the square draws, as the
game fits it to the faces when the square loads. The outlines are read from the game's own table
with its bundler, so the two never disagree; none if that can't be run (the game still takes out
what it lays its own ground over, as before).
"""
import functools
import json
import os
import subprocess
import sys
import tempfile

from shapely.geometry import Polygon, box
from shapely.ops import unary_union

from .cache import ROOT, sha

WEB = os.path.join(ROOT, "web")
REACH = 30.0        # metres round the square that its carriageway is handed to the set pieces fitting to it

_ENTRY = """
import { filledOutlines } from "%s/src/landmarks/setpieces";
let text = "";
process.stdin.on("data", (c) => (text += c));
process.stdin.on("end", () => {
  const { centre, box, road } = JSON.parse(text);
  const inside = (x, y) => {
    let n = false;
    for (const ring of road) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) n = !n;
    }
    return n;
  };
  console.log(JSON.stringify(filledOutlines(centre, box, inside)));
});
"""


@functools.lru_cache(maxsize=1)
def bundle():
    """The game's set piece table bundled for Node, or None if the bundler can't be run."""
    try:
        return subprocess.run([os.path.join(WEB, "node_modules", ".bin", "esbuild"), "--bundle", "--platform=node",
                               "--format=esm", "--loader=ts", "--log-level=error",
                               "--banner:js=globalThis.location={search:''};globalThis.window=globalThis;"],
                              input=_ENTRY % WEB, capture_output=True, text=True, check=True).stdout
    except (OSError, subprocess.CalledProcessError) as e:
        # (said aloud: a square written without the cut looks right until the set piece is beside it)
        print(f"setpiece_cuts: can't bundle the set pieces' table, so no square is cut for them ({e})", file=sys.stderr, flush=True)
        return None


@functools.lru_cache(maxsize=1)
def _script():
    js = bundle()
    if js is None:
        return None
    path = os.path.join(tempfile.gettempdir(), f"setpiece_cuts_{sha(js)[:16]}.mjs")
    if not os.path.exists(path):
        with open(path + ".part", "w") as f:
            f.write(js)
        os.replace(path + ".part", path)
    return path


def digest():
    """What the cut depends on besides the square: the set pieces' table and the code fitting them."""
    js = bundle()
    return sha(js) if js else "none"


def _rings(g):
    for p in getattr(g, "geoms", [g]):
        if p.geom_type == "Polygon" and not p.is_empty:
            yield [list(q) for q in p.exterior.coords]
            for h in p.interiors:
                yield [list(q) for q in h.coords]


def holes(centre, sq, road):
    """The outlines of the set pieces filling them that reach square sq (x0, y0, x1, y1) of a map
    centred at centre, as one shape in data metres, fitted to the carriageway `road`; None if none
    reaches it."""
    script = _script()
    if script is None or not centre:
        return None
    near = road.intersection(box(*sq).buffer(REACH)) if road is not None and not road.is_empty else Polygon()
    try:
        out = subprocess.run(["node", script], capture_output=True, text=True, check=True,
                             input=json.dumps({"centre": list(centre), "box": list(sq), "road": list(_rings(near))})).stdout
        rings = json.loads(out)
    except (OSError, subprocess.CalledProcessError, ValueError):
        return None
    polys = [Polygon(r).buffer(0) for r in rings if len(r) >= 3]
    polys = [p for p in polys if not p.is_empty]
    return unary_union(polys) if polys else None


@functools.lru_cache(maxsize=4)
def _reach(centre):
    whole = holes(centre, (-1e7, -1e7, 1e7, 1e7), None)
    return [] if whole is None else [g.buffer(REACH) for g in getattr(whole, "geoms", [whole])]


def key(centre, sq):
    """What square sq's cut depends on, for the writer's key: the set pieces' code if one filling
    its outline reaches the square, else nothing, so a change to them rewrites only their squares."""
    return digest() if any(g.intersects(box(*sq)) for g in _reach(tuple(centre))) else ""
