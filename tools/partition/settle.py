"""Which guessed boundaries stand, decided as the square is written.

The partition gives every building a plot and every plot a front, side and back boundary, and where
nothing was seen along one it guesses its material from the zone. Three kinds of guess came out
wrong against main, which only ever gave houses gardens:

  - a front wall along a shop street, or along a house that stands on the back of its pavement:
    there is no front garden there, so there is no front wall either;
  - a fence along a country lane, where the lidar saw a hedge here and there and the partition drew
    the whole side of the lane on the strength of it;
  - plots in a hamlet with no streets through it, where the division lines run on as long wedges
    across the neighbours' ground and the fields.

So each drawn boundary is kept where it is a house's garden, or where something real (a mapped
barrier or a lidar run) stands along it, and left out elsewhere. Nothing real is ever dropped here:
a stretch with a mapped or lidar barrier along it always stands.

Decided at write time because the partition's edges already say which plot lies either side, and the
squares can be written again in minutes where the plots take far longer; the rules belong in
`plots.classify_edges` once the plots are next rebuilt.
"""
import math
import os
import random

import numpy as np
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import substring
from shapely.strtree import STRtree

from gardens import STYLE as GARDEN_STYLE, pick
from . import MAP, ROOT, once, zone_at
from .data import Data
from .plots import FRONT_ROW, SUPPORT

HOUSES = {"detached", "semi", "terrace"}     # as `gardens.HOUSES`: only a house has a garden
OPEN_FRONT_ZONES = {"bath"}     # the city centre: buildings stand on the pavement, shops below
# zones whose guessed fronts are rolled from the suburb's mix, as main rolls every zone without a mix
# of its own; the Georgian terraces keep the railings round their areas
SUBURB_FRONTS = {"victorian", "riverside"}
FRONT_GUESSES = {"garden_wall", "brick_wall_low", "hedge_low", "railing", "fence", "hedge"}
SETBACK = 1.5           # metres: a house this close to its front line has no front garden
SHOP_REACH = 4.0        # metres from a shop sign to the building it hangs on
EVIDENCE_NEAR = 1.5     # metres: a stretch this near a mapped or lidar barrier is backed by it
GARDEN_CAP = 40.0       # metres: a guessed garden boundary further than this from its house is a
                        # division running on across someone else's ground or a field
INFERRED_CAP = 20.0     # metres: the same for a boundary only a rule drew, as deep as a garden in
                        # the old build (`gardens.DEPTH`)
STREET_CLEAR = 3.0      # metres from a street within which a guessed boundary in the centre goes
LOOSE_HOLD = 0.3        # metres: a boundary's end this near another, or a building, is held by it
STEP = 1.0              # metres between the points a boundary is judged at
MIN_RUN = 3.0           # metres: a kept stretch shorter than this, between dropped ones, goes too
MIN_GAP = 2.0           # metres: a dropped stretch shorter than this, between kept ones, stays


class Evidence:
    """The mapped barriers and lidar wall runs near a square, for asking whether a stretch of
    boundary has something real standing along it."""

    def __init__(self, lines, mapped=()):
        self.lines = [l for l in lines if not l.is_empty and l.length > 0]
        self.mapped = list(mapped)      # (line, class) of the mapped ones, for the writer to stand
        self.tree = STRtree(self.lines) if self.lines else None

    def near(self, p, tol=EVIDENCE_NEAR):
        if self.tree is None:
            return False
        idx = np.atleast_1d(self.tree.query(p.buffer(tol)))
        return any(self.lines[int(k)].distance(p) <= tol for k in idx)


def load_evidence(sq, pad=50.0):
    """The same evidence the plots were divided against: mapped fences, walls and hedges, and the
    lidar's wall runs."""
    x0, y0, x1, y1 = sq
    win = (x0 - pad, y0 - pad, x1 + pad, y1 + pad)
    D = Data(os.path.join(ROOT, "data", "raw", MAP, "wide"), win, log=lambda *_: None)
    mapped = []
    for g, p in D.lines_near(win, "infrastructure"):
        if p.get("subtype") == "barrier" and p.get("class") in ("fence", "wall", "hedge", "retaining_wall"):
            mapped += [(l, p["class"]) for l in getattr(g, "geoms", [g])]
    return Evidence([l for l, _ in mapped] + [g for g, _c, _h in D.ridges_near(win)], mapped)


def house_kinds(owners, tile_buildings):
    """bi -> the game's building class, by which written footprint holds the plot's building. A
    building the tile does not hold (it lies over the square's edge) counts as a house, which is
    what the partition assumed for all of them."""
    polys, kinds = [], []
    for b in tile_buildings:
        try:
            g = Polygon(b["r"][0])
        except Exception:
            continue
        if g.is_valid and not g.is_empty:
            polys.append(g); kinds.append(b.get("c"))
    tree = STRtree(polys) if polys else None
    out = {}
    for bi, g in owners.items():
        p = g.representative_point()
        hit = None
        if tree is not None:
            for k in np.atleast_1d(tree.query(p)):
                if polys[int(k)].contains(p):
                    hit = kinds[int(k)]; break
            if hit is None:
                best = None
                for k in np.atleast_1d(tree.query(g)):
                    a = polys[int(k)].intersection(g).area
                    if a > 0.5 * g.area and (best is None or a > best[0]):
                        best = (a, kinds[int(k)])
                hit = best[1] if best else None
        out[bi] = hit
    return out


def _runs(flags):
    runs, k = [], 0
    while k < len(flags):
        j = k
        while j + 1 < len(flags) and flags[j + 1] == flags[k]:
            j += 1
        runs.append([flags[k], k, j])
        k = j + 1
    return runs


def _intervals(flags, L, n):
    """Arc-length intervals (a, b) where `flags` (one per sample, n+1 of them) is False. A short
    dropped stretch between two kept ones stands, so a wall isn't broken by a gap in the lidar, and
    a short kept stretch left on its own goes, so no stub stands in a field."""
    step = L / n
    flags = list(flags)
    for keep, a, b in _runs(flags):
        if not keep and a > 0 and b < n and (b - a + 1) * step < MIN_GAP:
            flags[a:b + 1] = [True] * (b - a + 1)
    for keep, a, b in _runs(flags):
        if keep and (b - a + 1) * step < MIN_RUN and not all(flags):
            flags[a:b + 1] = [False] * (b - a + 1)
    out = []
    for keep, a, b in _runs(flags):
        if not keep:
            out.append((0.0 if a == 0 else (a - 0.5) * step, L if b == n else (b + 0.5) * step))
    return out


def front_roll(zone, x, y, row=None):
    """A guessed front's material where the zone has no mix of its own: the suburb's, rolled once
    for a row of houses along a street, so a terrace doesn't change halfway along."""
    key = row or f"{math.floor(x / FRONT_ROW)}:{math.floor(y / FRONT_ROW)}"
    return pick(GARDEN_STYLE["suburb"][0], random.Random(f"{zone}:{key}").random())


def settle(part, owners, kinds, evidence, shops=(), row_at=None, streets=None):
    """Mark each drawn edge of `part` with what of it stands: `kind` 'none' where nothing does, or
    `drop`, a list of arc-length intervals left out. `owners` is bi -> footprint, `kinds` bi -> the
    game's building class, `streets` the street faces. Returns metres left out, by reason."""
    shop_pts = [Point(s[0], s[1]) for s in shops]
    shop_tree = STRtree(shop_pts) if shop_pts else None

    def is_house(bi):
        return bi in owners and kinds.get(bi, "terrace") in HOUSES

    def has_shop(bi):
        if shop_tree is None or bi not in owners:
            return False
        g = owners[bi]
        return any(g.distance(shop_pts[int(k)]) <= SHOP_REACH
                   for k in np.atleast_1d(shop_tree.query(g.buffer(SHOP_REACH))))

    gone = dict(front=0.0, lane=0.0, far=0.0)
    guessed = []
    for e in part["edges"]:
        if e["kind"] == "none" or len(e["xy"]) < 2:
            continue
        line = LineString([q[:2] for q in e["xy"]])
        L = line.length
        if L <= 0:
            continue
        sides = [s[0] for s in e.get("sides") or []]
        plots = [s[1] for s in e.get("sides") or [] if s[0] == "plot" and len(s) > 1]
        n = max(2, int(math.ceil(L / STEP)))
        pts = [line.interpolate(k / n, normalized=True) for k in range(n + 1)]
        real = [evidence.near(p) for p in pts]
        real_share = sum(real) / len(real)

        if "corridor" in sides and plots:
            if e["kind"] not in FRONT_GUESSES or real_share >= SUPPORT:
                continue
            bi = plots[0]
            m = line.interpolate(0.5, normalized=True)
            setback = (sorted(owners[bi].distance(p) for p in pts)[len(pts) // 2]
                       if bi in owners else math.inf)
            zone = zone_at(m.x, m.y)
            if (not is_house(bi) or zone in OPEN_FRONT_ZONES or has_shop(bi)
                    or setback <= SETBACK):
                if any(real):
                    e["drop"] = _intervals(real, L, n)
                    gone["front"] += sum(b - a for a, b in e["drop"])
                else:
                    e["kind"] = "none"
                    gone["front"] += L
            elif zone in SUBURB_FRONTS:
                e["kind"] = front_roll(zone, m.x, m.y, row_at(m.x, m.y) if row_at else None)
            continue

        if "corridor" in sides:
            # a lane's edge against open land: only what stands there, and a field's edge is a
            # hedge, never a garden's fence
            drop = _intervals(real, L, n)
            if drop:
                e["drop"] = drop
                gone["lane"] += sum(b - a for a, b in drop)
            if e["kind"] == "fence":
                e["kind"] = "hedge"
            continue

        if e.get("source") == "evidence" and real_share >= SUPPORT:
            continue
        houses = [owners[bi] for bi in plots if is_house(bi)]
        if houses:
            cap = GARDEN_CAP if e.get("source") == "parcel" else INFERRED_CAP
            garden = [all(h.distance(p) <= cap for h in houses) for p in pts]
        else:
            garden = [False] * len(pts)
        m = line.interpolate(0.5, normalized=True)
        if streets is not None and any(garden) and zone_at(m.x, m.y) in OPEN_FRONT_ZONES:
            # in the centre a yard's fence along the street is a front by another name
            garden = [g and streets.distance(p) > STREET_CLEAR for g, p in zip(garden, pts)]
        flags = [g or r for g, r in zip(garden, real)]
        if not any(flags):
            e["kind"] = "none"
            gone["far"] += L
            continue
        drop = _intervals(flags, L, n)
        if drop:
            e["drop"] = drop
            gone["far"] += sum(b - a for a, b in drop)
        if not any(garden) and e["kind"] == "fence":
            e["kind"] = "hedge"
        if not all(real):
            guessed.append(e)
    gone["far"] += _drop_loose(part["edges"], guessed, list(owners.values()))
    return gone


def _kept_pieces(e):
    line = LineString([q[:2] for q in e["xy"]])
    at, out = 0.0, []
    for a, b in sorted(e.get("drop") or ()) + [(line.length, line.length)]:
        if a - at > 0.05:
            out.append((at, a, substring(line, at, a)))
        at = max(at, b)
    return out


def _drop_loose(edges, guessed, buildings, hold=LOOSE_HOLD):
    """A guessed stretch left meeting nothing at either end, once the far ends of the gardens have
    gone, is a fence standing on its own in a field: it goes too."""
    drawn = [(e, a, b, g) for e in edges if e["kind"] != "none" for a, b, g in _kept_pieces(e)]
    if not drawn:
        return 0.0
    geoms = [g for *_, g in drawn] + list(buildings)
    tree = STRtree(geoms)
    ids = {id(e) for e in guessed}
    gone = 0.0
    for n, (e, a, b, g) in enumerate(drawn):
        if id(e) not in ids:
            continue
        ends = [Point(g.coords[0]), Point(g.coords[-1])]
        held = [any(k != n and geoms[int(k)].distance(p) <= hold for k in tree.query(p.buffer(hold)))
                for p in ends]
        if not any(held):
            e["drop"] = sorted((e.get("drop") or []) + [(a, b)])
            gone += b - a
    return gone


def owners_near(once_dir, sq, pad=150.0):
    x0, y0, x1, y1 = sq
    return dict(once.read_cleaned(once_dir, (x0 - pad, y0 - pad, x1 + pad, y1 + pad)))
