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
a stretch with a mapped or lidar barrier along it always stands, and a guess along a mapped barrier
takes its kind there, so a garden's fence is not drawn beside the hedge the map has on its line.
A guessed wall or hedge with nothing at all standing near it in the lidar goes too (`standing.py`).
A house Historic England lists railings or a wall in front of keeps them, wherever it stands, but
for one on a pedestrian street: a shopping street is paved to its shopfronts, so nothing guessed or
listed stands between the two, and only what is really there does.

Decided at write time because the partition's edges already say which plot lies either side, and the
squares can be written again in minutes where the plots take far longer; the rules belong in
`plots.classify_edges` once the plots are next rebuilt.
"""
import math
import os
import random

import numpy as np
import shapely
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
PEDESTRIAN_SHARE = 0.5  # of a boundary's length on a pedestrian street that makes it that street's edge
STANDING_REACH = 4.0    # metres: a guessed wall or hedge with nothing standing this near goes
UNSTOOD_SOURCES = {"front", "inferred"}     # a registered parcel's edge is evidence enough
MIN_GAP = 2.0           # metres: a dropped stretch shorter than this, between kept ones, stays


LISTED_REACH = 4.0      # metres from a listed entry's point to the house whose front it is
LISTED_EDGE = 5.0       # metres from a listed entry's point to the street's edge it stands on
LISTED_HOUSE = 15.0     # metres from such an entry to the building whose front it is
LISTED_RUN = 8.0        # metres from the entry that its railings or wall stand along the edge, unmeasured
LISTED_WALL = "stone_wall"
MAPPED_GROUP = {"wall": "wall", "retaining_wall": "wall", "hedge": "hedge", "fence": "fence"}
WALLS = {"garden_wall", "stone_wall", "brick_wall_low", "brick_wall_high", "wall", "retaining_wall"}
GUESSED = {"front", "parcel", "inferred"}


def as_mapped(kind, mapped):
    """A guessed boundary's kind once a mapped barrier is found along it: the map says wall, hedge
    or fence, and the guess keeps its own look where it already agrees."""
    if mapped == "wall":
        return kind if kind in WALLS else "wall"
    if mapped == "hedge":
        return kind if kind in ("hedge", "hedge_low") else "hedge"
    return kind if kind in ("fence", "railing") else "fence"


class Evidence:
    """The mapped barriers and lidar wall runs near a square, for asking whether a stretch of
    boundary has something real standing along it."""

    def __init__(self, lines, mapped=(), listed=()):
        self.lines = [l for l in lines if not l.is_empty and l.length > 0]
        self.mapped = [(l, c) for l, c in mapped if not l.is_empty and l.length > 0]
        self.tree = STRtree(self.lines) if self.lines else None
        self.mapped_tree = STRtree([l for l, _ in self.mapped]) if self.mapped else None
        self.listed = list(listed)
        self.listed_tree = STRtree([p for p, _ in self.listed]) if self.listed else None

    def listed_front(self, house, reach=LISTED_REACH):
        """The kind of a house's front boundary where Historic England lists railings or a wall
        within `reach` of it, railings first (an area's railings often stand on a listed wall)."""
        if self.listed_tree is None:
            return None
        hit = {self.listed[int(k)][1] for k in np.atleast_1d(self.listed_tree.query(house.buffer(reach)))
               if house.distance(self.listed[int(k)][0]) <= reach}
        return "railing" if "railing" in hit else LISTED_WALL if hit else None

    def near(self, p, tol=EVIDENCE_NEAR):
        if self.tree is None:
            return False
        idx = np.atleast_1d(self.tree.query(p.buffer(tol)))
        return any(self.lines[int(k)].distance(p) <= tol for k in idx)

    def mapped_at(self, pts, tol=EVIDENCE_NEAR):
        """For each of `pts`, 'wall', 'hedge' or 'fence' for the mapped barrier along it, or None."""
        out = []
        for p in pts:
            near = []
            if self.mapped_tree is not None:
                near = [self.mapped[int(k)] for k in np.atleast_1d(self.mapped_tree.query(p.buffer(tol)))]
                near = [MAPPED_GROUP.get(c, "wall") for l, c in near if l.distance(p) <= tol]
            out.append(max(set(near), key=near.count) if near else None)
        return out

    def mapped_hedge_or_fence(self, pts, tol=EVIDENCE_NEAR):
        """'hedge' or 'fence' where most of `pts` that have a mapped barrier along them have that
        one, else None."""
        seen = [k for k in self.mapped_at(pts, tol) if k]
        best = max(set(seen), key=seen.count) if seen else None
        return best if best != "wall" and seen.count(best) * 2 > len(seen) else None


def barrier_lines(g):
    """A mapped barrier's lines. A fence round a park or a hedge round a field is mapped as an area,
    and stands along its outline, as main's `prep_map.py` reads it."""
    out = []
    for part in getattr(g, "geoms", [g]):
        if part.geom_type == "Polygon":
            out.append(LineString(part.exterior.coords))
        elif part.geom_type == "LineString":
            out.append(part)
    return out


def load_evidence(sq, pad=50.0):
    """Mapped fences, walls and hedges (with the outlines of those mapped as areas) and the lidar's
    wall runs."""
    x0, y0, x1, y1 = sq
    win = (x0 - pad, y0 - pad, x1 + pad, y1 + pad)
    D = Data(os.path.join(ROOT, "data", "raw", MAP, "wide"), win, log=lambda *_: None)
    mapped = []
    for g, p in D.near(win, "infrastructure"):
        if p.get("subtype") == "barrier" and p.get("class") in ("fence", "wall", "hedge", "retaining_wall"):
            mapped += [(l, p["class"]) for l in barrier_lines(g)]
    listed = [(g, p["kind"]) for g, p in D.near(win, "listed") if g.geom_type == "Point"]
    return Evidence([l for l, _ in mapped] + [g for g, _c, _h in D.ridges_near(win)], mapped, listed)


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


def take_mapped(e, along, L, n):
    """A guessed boundary takes the kind of a mapped barrier it runs along: the whole of it where
    the barrier runs most of its length, else `restyle`, arc-length stretches (a, b, kind) drawn
    as the mapped kind."""
    seen = [k for k in along if k]
    if not seen:
        return
    best = max(set(seen), key=seen.count)
    if seen.count(best) * 2 > len(along):
        e["kind"] = as_mapped(e["kind"], best)
        return
    step = L / n
    out = []
    for k, a, b in _runs(along):
        if k is None or (b - a + 1) * step < MIN_RUN or as_mapped(e["kind"], k) == e["kind"]:
            continue
        lo, hi = (a - 0.5) * step, (b + 0.5) * step
        # a stretch ending this near the boundary's end runs to it, leaving no stub of the guess
        lo = 0.0 if lo < MIN_GAP else lo
        hi = L if L - hi < MIN_GAP else hi
        if out and out[-1][2] == as_mapped(e["kind"], k) and lo - out[-1][1] < MIN_GAP:
            out[-1] = (out[-1][0], hi, out[-1][2])
        else:
            out.append((lo, hi, as_mapped(e["kind"], k)))
    if out:
        e["restyle"] = out


def front_roll(zone, x, y, row=None):
    """A guessed front's material where the zone has no mix of its own: the suburb's, rolled once
    for a row of houses along a street, so a terrace doesn't change halfway along."""
    key = row or f"{math.floor(x / FRONT_ROW)}:{math.floor(y / FRONT_ROW)}"
    return pick(GARDEN_STYLE["suburb"][0], random.Random(f"{zone}:{key}").random())


def settle(part, owners, kinds, evidence, shops=(), row_at=None, streets=None, pedestrian=None):
    """Mark each drawn edge of `part` with what of it stands: `kind` 'none' where nothing does, or
    `drop`, a list of arc-length intervals left out. `owners` is bi -> footprint, `kinds` bi -> the
    game's building class, `streets` the street faces, `pedestrian` the ground of the pedestrian
    streets. Returns metres left out, by reason."""
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

    gone = dict(front=0.0, lane=0.0, far=0.0, pedestrian=0.0)
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
        if (e.get("source") in GUESSED and pedestrian is not None
                and line.intersection(pedestrian).length >= PEDESTRIAN_SHARE * L):
            take_mapped(e, evidence.mapped_at(pts), L, n)
            if not all(real):
                e["drop"] = _intervals(real, L, n)
                gone["pedestrian"] += sum(b - a for a, b in e["drop"])
            continue
        listed = None
        if e.get("source") in GUESSED:
            if "corridor" in sides and plots and plots[0] in owners and e["kind"] in FRONT_GUESSES:
                listed = evidence.listed_front(owners[plots[0]])
                if listed:
                    e["kind"] = listed
            take_mapped(e, evidence.mapped_at(pts), L, n)
        if listed:
            continue

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
            # hedge, not a garden's fence, unless a fence is mapped along it
            drop = _intervals(real, L, n)
            if drop:
                e["drop"] = drop
                gone["lane"] += sum(b - a for a, b in drop)
            if e["kind"] in ("fence", "hedge"):
                e["kind"] = evidence.mapped_hedge_or_fence(pts) or "hedge"
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
            e["kind"] = evidence.mapped_hedge_or_fence(pts) or "hedge"
        if not all(real):
            guessed.append(e)
    gone["far"] += _drop_loose(part["edges"], guessed, list(owners.values()))
    listed_open_fronts(part, owners, evidence, pedestrian)
    return gone


def listed_open_fronts(part, owners, evidence, pedestrian=None):
    """Listed railings standing on a street's edge in front of a building set back behind
    open ground (Cleveland House's plinth and railings on Sydney Road, over the canal's tunnel): the
    entry's point is on the railings, not by the house, and the edge there divides the street from
    open ground the partition guessed nothing along. That edge stands as railings within
    `LISTED_RUN` of the entry, about a house's front."""
    if evidence.listed_tree is None or not owners:
        return
    houses = list(owners.values())
    house_tree = STRtree(houses)
    for e in part["edges"]:
        sides = [s[0] for s in e.get("sides") or []]
        if e["kind"] != "none" or len(e["xy"]) < 2 or sorted(sides) != ["corridor", "open"]:
            continue
        line = LineString([q[:2] for q in e["xy"]])
        if line.length <= 0 or (pedestrian is not None and line.intersects(pedestrian)):
            continue
        for k in np.atleast_1d(evidence.listed_tree.query(line.buffer(LISTED_EDGE))):
            point, kind = evidence.listed[int(k)]
            # (a listed wall's point is often in the middle of an estate's wall, nowhere near a street)
            if kind != "railing" or line.distance(point) > LISTED_EDGE:
                continue
            if houses[int(house_tree.nearest(point))].distance(point) > LISTED_HOUSE:
                continue
            n = max(2, int(math.ceil(line.length / STEP)))
            near = [line.interpolate(i / n, normalized=True).distance(point) <= LISTED_RUN for i in range(n + 1)]
            if sum(near) * line.length / n < MIN_RUN:
                continue
            e["kind"] = "railing"
            e["drop"] = _intervals(near, line.length, n)
            break


def drop_unstood(part, evidence, standing, reach=STANDING_REACH, sources=UNSTOOD_SOURCES):
    """Leave out the stretches of guessed walls and hedges with nothing standing within `reach`
    metres, nor a mapped barrier or lidar run along them. Returns metres left out."""
    gone = 0.0
    for e in part["edges"]:
        if e.get("source") not in sources or (e["kind"] not in WALLS and e["kind"] not in ("hedge", "hedge_low")):
            continue
        line = LineString([q[:2] for q in e["xy"]])
        L = line.length
        if L <= 0:
            continue
        n = max(2, int(math.ceil(L / STEP)))
        restyled = e.get("restyle") or ()
        flags = []
        for k in range(n + 1):
            p = line.interpolate(k / n, normalized=True)
            t = k * L / n
            flags.append(any(a <= t <= b for a, b, _ in restyled) or standing.near(p, reach) or evidence.near(p))
        if all(flags):
            continue
        before = _dropped(e, L)
        if not any(flags):
            e["drop"] = [(0.0, L)]
        else:
            e["drop"] = sorted((e.get("drop") or []) + _intervals(flags, L, n))
        gone += _dropped(e, L) - before
    return gone


def _dropped(e, L):
    at, out = 0.0, 0.0
    for a, b in sorted(e.get("drop") or ()):
        a, b = max(a, at), min(b, L)
        if b > a:
            out += b - a
            at = b
    return out


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
