"""Where a square's street faces are cut for the set pieces (web/src/landmarks/setpieces.ts,
setPieceCuts), so each meets the faces edge to edge, rather than the game taking out whole
triangles across its edge as the square loads and leaving a ragged strip of the map's verge or
pavement, or a hole, between them.

- A set piece marked `fills` draws everything inside its outline, out to the edge: the faces inside
  go. One that fits its outline to the street (the Royal Crescent's flags run out to the kerb) is
  fitted to the carriageway the square draws, as the game fits it to the faces when the square loads.
- Every other set piece's outline splits the faces along it (but the carriageways, which the game
  keeps through it), all kept: the game takes out those it lays its own floor, deck or paving over,
  and now finds each one wholly inside or outside.
- A set piece's own street (Pulteney Bridge's, on into Argyle Street) is drawn by the game over the
  square's roads as it lays them: the faces go exactly where it's drawn.

The outlines are read from the game's own table with its bundler, so the two never disagree; none
if that can't be run (the game still takes out what it lays its own ground over, as before, and
does the same for a set piece added or moved since the square was written).
"""
import functools
import json
import os
import subprocess
import sys
import tempfile

import shapely
from shapely import STRtree
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union

from .cache import ROOT, sha

WEB = os.path.join(ROOT, "web")
REACH = 30.0        # metres round the square that its carriageway is handed to the set pieces fitting to it

_ENTRY = """
import { setPieceCuts } from "%s/src/landmarks/setpieces";
let text = "";
process.stdin.on("data", (c) => (text += c));
process.stdin.on("end", () => {
  const { centre, box, road, rd } = JSON.parse(text);
  const inside = (x, y) => {
    let n = false;
    for (const ring of road) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) n = !n;
    }
    return n;
  };
  const out = setPieceCuts(centre, box, inside, rd ?? undefined);
  const band = out.street.filter((q) => q.kind === "pave").map((q) => ({ kind: "band", p: [...q] }));
  console.log(JSON.stringify({ ...out, corners: [...out.corners.map((q) => ({ kind: q.kind, p: [...q] })), ...band] }));
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


ROADS_NEAR = 60.0    # metres round the square that its roads are handed to the set pieces laying their own street over them


def _shape(rings):
    polys = [Polygon(r).buffer(0) for r in rings if len(r) >= 3]
    polys = [p for p in polys if not p.is_empty]
    return unary_union(polys) if polys else None


def _run(centre, sq, road, rd):
    script = _script()
    if script is None or not centre:
        return None
    near = road.intersection(box(*sq).buffer(REACH)) if road is not None and not road.is_empty else Polygon()
    reach = box(*sq).buffer(ROADS_NEAR).bounds
    ways = None if rd is None else [{"n": r.get("n", ""), "c": r["c"], "w": r.get("w"), "pv": r.get("pv"), "p": [q[:4] for q in r["p"]]}
                                    for r in rd if len(r["p"]) > 1 and any(reach[0] < q[0] < reach[2] and reach[1] < q[1] < reach[3] for q in r["p"])]
    try:
        out = subprocess.run(["node", script], capture_output=True, text=True, check=True,
                             input=json.dumps({"centre": list(centre), "box": list(sq), "road": list(_rings(near)), "rd": ways})).stdout
        return json.loads(out)
    except (OSError, subprocess.CalledProcessError, ValueError):
        return None


def cuts(centre, sq, road, rd=None):
    """The cuts for the set pieces reaching square sq (x0, y0, x1, y1) of a map centred at centre, as
    shapes in data metres (each None if there's none): (taken out, split along, the lines a set piece
    lays its own street along, each [x, y, z] its points at the heights it lays them). `road` is the
    carriageway the set pieces fitting to it are fitted to; rd the square's roads, for a set piece's
    own street laid over them (without them, the stretch it's laid along is taken out, for `key`)."""
    gone, split, lines, _, _ = cut_parts(centre, sq, road, rd)
    return gone, split, lines


def cut_parts(centre, sq, road, rd=None):
    """As `cuts`, and the part of what's taken out that is a set piece's own street (None if none),
    and its pavements' stretches at a junction, left to the square to lay (setPieceCuts `corners`):
    (kind, shape) each, kind "road" or "pave" as the street draws it, with the stretches of pavement it
    draws itself as "band" (cut out with the rest, for the corners to meet)."""
    got = _run(centre, sq, road, rd)
    if got is None:
        return None, None, [], None, []
    near = box(*sq).buffer(REACH)

    def here(g):
        # (only where it reaches the square: the street's quads run the whole length of it)
        g = g.intersection(near) if g is not None else None
        return None if g is None or g.is_empty else g
    fill, street = _shape(got["fill"]), _shape(got["street"])
    corners = [(q["kind"], p) for q in got.get("corners") or []
               for p in [_corner(q)] if p is not None and p.intersects(near)]
    # (where a pavement fans out over the street's own carriageway, as where it opens into a place at
    # its end, there's no corner of the square's there to lay: the street draws it as before)
    over = [(k, p) for k, p in corners if k != "band" and street is not None and p.intersection(street).area > p.area / 2]
    if over:
        street = unary_union([street] + [p for _, p in over])
        corners = [c for c in corners if c not in over]
    gone = here(unary_union([g for g in (fill, street) if g is not None])) if fill is not None or street is not None else None
    return gone, _shape(got["split"]), got.get("lines") or [], here(street), corners


def _corner(q):
    p = Polygon(q["p"]).buffer(0)
    return None if p.is_empty else p


def _outlines(centre, sq):
    got = _run(centre, sq, None, None)
    return None if got is None else _shape(got["fill"] + got["split"])


def _along(p, i, j):
    return sum(((p[k + 1][0] - p[k][0]) ** 2 + (p[k + 1][1] - p[k][1]) ** 2) ** 0.5 for k in range(i, j))


# as setpieces.ts JOIN_LEVEL: ways nearer each other in height than this meet
JOIN_LEVEL = 1.0
# metres from a way's deck point to the span it rides: past this the nearest span in the square is
# some other bridge, and judging by it left the same point on the deck in one square and on the
# ground in the next (structures.py's widest deck reach is under 13 m)
RIDE = 15.0
# metres a way's heights are moved by before its faces are levelled by them rather than by the survey's
# ground under its line, which leaves out the vaults these streets stand on
LAID_MOVED = 0.1


def lay(centre, sq, rd):
    """rd as the set pieces reaching square sq lay it, changed in place:
    - a way riding a set piece's bridge (its points marked 2, on the deck of the bridge beside it,
      where that bridge's span, marked 1, is the set piece's, inside its outline) is on the ground
      where it runs off the deck on to the land outside the outline, at an even grade from the deck's
      end to where it was on the ground already. The set piece builds its own bridge out to its
      outline; past that the way is a street like any other, its faces fitted into the junction
      there, not a strip of deck of its own laid across the others' (Pulteney Bridge's west end,
      where Bridge Street and Grand Parade meet over the vaults the survey's ground leaves out);
    - a set piece's own street is at the heights it lays it (setpieces.ts gradeStreet), so the
      square's faces meeting it are at its level.
    A way moved so is marked `_laid` for the faces (write_tile.street_surfaces) to be levelled by its
    heights; the writer takes the mark off again."""
    if not centre or not rd:
        return rd
    spans = [q for r in rd for q in r["p"] if len(q) > 3 and q[3] == 1]
    if spans and any(len(q) > 3 and q[3] == 2 for r in rd for q in r["p"]):
        shape = _outlines(centre, sq)
        if shape is not None:
            shapely.prepare(shape)
            tree = STRtree([Point(q[:2]) for q in spans])
            node_z = {}
            for r in rd:
                for q in r["p"]:
                    k = (round(q[0], 2), round(q[1], 2))
                    node_z[k] = max(node_z.get(k, q[2]), q[2])
            for r in rd:
                p = r["p"]
                freed = [k for k, q in enumerate(p) if len(q) > 3 and q[3] == 2 and not shape.contains(Point(q[:2]))
                         and (n := tree.query_nearest(Point(q[:2]), max_distance=RIDE)).size
                         and shape.contains(Point(spans[int(n[0])][:2]))]
                # (and the deck's end, where the way left on the deck is that one point: its strip ran
                # off the deck across the junction)
                deck = lambda k: 0 <= k < len(p) and k not in freed and len(p[k]) > 3 and p[k][3] in (1, 2)
                ends = [k for k, q in enumerate(p) if freed and deck(k) and q[3] == 2 and not deck(k - 1) and not deck(k + 1)
                        and (k - 1 in freed or k + 1 in freed)]
                for k in freed + ends:
                    p[k] = list(p[k][:3])
                if freed:
                    r["_laid"] = True
                for k in freed:
                    i, j = k, k
                    while i - 1 >= 0 and i - 1 in freed:
                        i -= 1
                    while j + 1 < len(p) and j + 1 in freed:
                        j += 1
                    if i == 0 or j == len(p) - 1:
                        continue
                    a, b = p[i - 1], p[j + 1]
                    zb = node_z.get((round(b[0], 2), round(b[1], 2)), b[2]) if len(b) == 3 else b[2]
                    if len(b) == 3:
                        b[2] = zb
                    whole = _along(p, i - 1, j + 1) or 1
                    p[k][2] = round(a[2] + (zb - a[2]) * _along(p, i - 1, k) / whole, 2)
    got = _run(centre, sq, None, rd)
    laid = {(round(q[0], 2), round(q[1], 2)): q[2] for line in (got or {}).get("lines") or [] for q in line}
    for r in rd:
        for q in r["p"]:
            z = laid.get((round(q[0], 2), round(q[1], 2)))
            # (a way ending under the deck at the laid street's node keeps its own level)
            if z is not None and abs(z - q[2]) < JOIN_LEVEL:
                if abs(z - q[2]) > LAID_MOVED:
                    r["_laid"] = True
                q[2] = z
    # (and the ways meeting one at its ends: levelled by the ground there, they met it a step down)
    moved = {(round(q[0], 2), round(q[1], 2)) for r in rd if r.get("_laid") for q in (r["p"][0], r["p"][-1])}
    for r in rd:
        if any((round(q[0], 2), round(q[1], 2)) in moved for q in (r["p"][0], r["p"][-1])):
            r["_laid"] = True
    return rd


@functools.lru_cache(maxsize=4)
def _reach(centre):
    gone, split, _ = cuts(centre, (-1e7, -1e7, 1e7, 1e7), None)
    return [g.buffer(REACH) for whole in (gone, split) if whole is not None for g in getattr(whole, "geoms", [whole])]


def key(centre, sq):
    """What square sq's cut depends on, for the writer's key: the set pieces' code if one reaches the
    square, else nothing, so a change to them rewrites only their squares."""
    return digest() if any(g.intersects(box(*sq)) for g in _reach(tuple(centre))) else ""
