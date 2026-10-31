"""How wide the streets really are, fitted between the walls and buildings either side of them.

The map data gives a street only a centre line and a kind (a main road, a residential street, a
lane), and the game draws every street of a kind the same width, with a 1.7 m pavement each side.
Many of Bath's streets are narrower than that: lanes squeezed between garden walls, a main road
like Ralph Allen Drive between estate walls, and plenty have a pavement on one side or none.
Drawn too wide, the street runs over the walls beside it. So the walls are found first (in the
lidar, tools/walls.py) and each street is fitted between them and the buildings, using
everything else we have, in this order:

- OpenStreetMap, where the street is tagged (tools/osm.py roads): its width, or its number of
  lanes (about 3.25 m each), and which sides have a pavement ("sidewalk"). A street whose
  pavements are mapped as footpaths of their own has none drawn on it (the paths are drawn), and
  so does a side with a mapped footpath running alongside it, tagged or not.
- The walls and building fronts: from each point along the street, look out sideways each way,
  up to 12 m, for the first wall or building front running along the street. Each side's distance
  is the middle reading over the dozen points round it, so a gate pier doesn't narrow it. Where the
  street and its pavement on a side reach further than that, the carriageway narrows first, to
  an ordinary street's width; then that side's pavement, to 1 m (only OpenStreetMap or a mapped
  footpath takes a pavement away); then the carriageway again, but never below its kind's
  narrowest (two cars passing on a main road, a car and a parked one where there's a pavement,
  one car on a lane).

A street is never made wider than its kind, and it changes width only in stretches of 30 m or
more. Each street (or piece of one) that differs from its kind carries "w", its carriageway's
width, and "pv", its pavements' widths [left, right] looking along its points.
"""
import math
import numpy as np

REACH, STEP = 12.0, 0.5     # metres looked out from the centre line, and how often
SPARE = 0.5                # metres kept clear between a pavement (or the road) and the wall
NARROWEST = {"trunk": 6.0, "primary": 5.5, "secondary": 5.5, "tertiary": 5.0}   # else 3.5
SOFT = {"trunk": 7.0, "primary": 6.5, "secondary": 6.0, "tertiary": 5.5}        # an ordinary street's width: else 5
PAVE = 1.7
LANES = {"service": 2.5, "unknown": 2.5}     # lanes and drives, fitted between what's either side of them too
WALKS = {"footway", "path", "cycleway"}     # mapped footpaths that can be a street's pavement


def _side_reach(tree, obstacles, p, nrm, t, s, houses_from=None):
    """For each point p (looking out to side s, +1 left, -1 right), the distance to the first wall
    or building front in reach that runs along the street (within 35 degrees), or None; and, if
    houses_from is given (obstacles from there on are buildings), whether that's a building."""
    import shapely
    out = []
    cos_tol = np.cos(np.radians(35))
    for i in range(len(p)):
        end = p[i] + s * REACH * nrm[i]
        ray = shapely.LineString([p[i], end])
        best = None
        for k in tree.query(ray, predicate="intersects"):
            ob = obstacles[int(k)]
            hit = ray.intersection(ob)
            if hit.is_empty: continue
            d = shapely.Point(*p[i]).distance(hit)
            if d < 0.5 or (best is not None and d >= best): continue
            # the obstacle's direction where it's hit
            at = ob.project(shapely.Point(*p[i]) if hit.geom_type != "Point" else hit)
            q0, q1 = ob.interpolate(max(0, at - 0.5)), ob.interpolate(min(ob.length, at + 0.5))
            v = np.array([q1.x - q0.x, q1.y - q0.y]); v /= (np.linalg.norm(v) or 1)
            if abs(float(v @ t[i])) < cos_tol: continue
            best, house = d, houses_from is not None and int(k) >= houses_from
        out.append(best if houses_from is None else (best, best is not None and house))
    return out


def _num(v):
    try: return float(str(v).split()[0].replace("m", ""))
    except (ValueError, IndexError): return None


def osm_tags(osm_roads):
    """A finder for the OpenStreetMap tags of the street along (p, direction): (width, pavements
    [left, right] looking that way, or None where untagged), from the nearest tagged highway
    within 6 m that runs the same way."""
    import shapely
    if not osm_roads: return lambda p, t: (None, None)
    lines = [(g, props) for g, props in osm_roads if g.geom_type == "LineString" and g.length > 0]
    tree = shapely.STRtree([g for g, _ in lines])

    def find(p, t):
        pt = shapely.Point(*p)
        best = None
        for k in tree.query(pt.buffer(6)):
            g, props = lines[int(k)]
            d = g.distance(pt)
            if d > 6 or (best and d >= best[0]): continue
            s = g.project(pt)
            a, b = g.interpolate(max(0, s - 1)), g.interpolate(min(g.length, s + 1))
            u = np.array([b.x - a.x, b.y - a.y]); u /= (np.linalg.norm(u) or 1)
            dot = float(u @ t)
            if abs(dot) < 0.8: continue          # a street crossing this one
            best = (d, props, dot > 0)
        if best is None: return None, None
        _, props, same = best
        w = _num(props.get("width")) or _num(props.get("est_width"))
        if w is None and _num(props.get("lanes")): w = 3.25 * _num(props["lanes"])
        sw = props.get("sidewalk:both") or props.get("sidewalk")
        side = {"both": [1, 1], "left": [1, 0], "right": [0, 1], "no": [0, 0], "none": [0, 0], "separate": [0, 0], "yes": [1, 1]}.get(sw)
        left, right = props.get("sidewalk:left"), props.get("sidewalk:right")
        if left or right:
            side = side or [1, 1]
            if left: side[0] = 0 if left in ("no", "separate") else 1
            if right: side[1] = 0 if right in ("no", "separate") else 1
        if side and not same: side = side[::-1]
        return w, side
    return find


def measure(obstacles, roads, RW, kerbed, osm_roads=None, houses_from=None):
    """Roads with the narrowed ones cut into pieces that each carry "w" (the carriageway's width)
    and "pv" (its pavements' widths, [left, right]). obstacles are the walls the lidar found
    (tools/walls.py) and the buildings' outlines, as lines."""
    import shapely
    out, narrowed = [], 0
    tree = shapely.STRtree(obstacles) if obstacles else None
    tags = osm_tags(osm_roads)
    # mapped footpaths, so a street with one running alongside takes it as that side's pavement
    walks = [((np.array(a[:2], float), np.array(b[:2], float))) for f in roads if f["c"] in WALKS
             for a, b in zip(f["p"], f["p"][1:]) if math.hypot(b[0] - a[0], b[1] - a[1]) > 0.5]
    wtree = shapely.STRtree([shapely.LineString([a, b]) for a, b in walks]) if walks else None

    def walked(pt, tan, side, reach):
        """Whether a mapped footpath runs alongside the street at pt, on that side, within reach."""
        if wtree is None: return False
        for k in wtree.query(shapely.Point(pt).buffer(reach)):
            a, b = walks[int(k)]
            d = b - a; L = np.linalg.norm(d); u = d / L
            if abs(float(u @ tan)) < 0.8: continue
            f = float((pt - a) @ u)
            if f < -1 or f > L + 1: continue
            off = a + u * f - pt
            lat = float(tan[0] * off[1] - tan[1] * off[0])      # left of the street is positive
            if 1.0 < lat * side < reach: return True
        return False

    for r in roads:
        pts = r["p"]
        if r["c"] not in RW or r["c"] not in NARROWEST and r["c"] not in kerbed and r["c"] not in LANES or r.get("w") \
           or len(pts) < 2 or any(len(q) > 3 for q in pts):      # (a street on a bridge keeps its deck)
            out.append(r); continue
        p = np.array([q[:2] for q in pts], float)
        a, b = p[np.maximum(np.arange(len(p)) - 1, 0)], p[np.minimum(np.arange(len(p)) + 1, len(p) - 1)]
        t = b - a
        t /= np.maximum(np.linalg.norm(t, axis=1), 1e-6)[:, None]
        nrm = np.stack([-t[:, 1], t[:, 0]], 1)        # to the left
        reach = [_side_reach(tree, obstacles, p, nrm, t, s, houses_from) for s in (1, -1)] if tree is not None and houses_from is not None else None
        sides = [[d for d, _ in rs] for rs in reach] if reach else \
            [_side_reach(tree, obstacles, p, nrm, t, s) for s in (1, -1)] if tree is not None else [[None] * len(p)] * 2
        w0, pave0 = RW[r["c"]], (PAVE if r["c"] in kerbed else 0.0)
        soft, hard = SOFT.get(r["c"], 5.0), NARROWEST.get(r["c"], LANES.get(r["c"], 3.5))
        # A street's end is a junction, where the next street's tags and footpaths begin, so they
        # are read a few metres in from it: one reading at the corner would otherwise spread over
        # the street (below) and take away a pavement it has.
        seg = np.linalg.norm(np.diff(p, axis=0), axis=1)
        inner = p.copy()
        inner[0] = p[0] + t[0] * min(3.0, seg[0] / 2)
        inner[-1] = p[-1] - t[-1] * min(3.0, seg[-1] / 2)
        fits = []
        for i in range(len(p)):
            ow, oside = tags(inner[i], t[i])
            w = min(w0, max(hard, ow)) if ow else w0
            pv = [pave0 * oside[0], pave0 * oside[1]] if oside else [pave0, pave0]
            for k, side in enumerate((1, -1)):
                if pv[k] and walked(inner[i], t[i], side, w0 / 2 + pave0 + 3.0): pv[k] = 0.0
            room = []
            for s in sides:
                near = [v for v in s[max(0, i - 6):i + 7] if v is not None]
                rm = float(np.median(near)) - SPARE if len(near) >= 3 else None
                # a building is no gate pier: one seen even at a single point keeps the street off it
                if reach:
                    hs = [d for d, h in reach[len(room)][max(0, i - 1):i + 2] if h]
                    if hs: rm = min(min(hs) - SPARE, rm if rm is not None else 1e9)
                room.append(rm)
            over = lambda: any(rm is not None and w / 2 + pv[k] > rm + 1e-6 for k, rm in enumerate(room))
            if over():
                w = max(min(w, soft), min(w, *(2 * (rm - pv[k]) for k, rm in enumerate(room) if rm is not None)))
                for k, rm in enumerate(room):
                    if rm is not None and w / 2 + pv[k] > rm:
                        # a pavement narrows to a metre, but only OpenStreetMap takes one away
                        pv[k] = min(pv[k], 1.0)
                # (a street left with a pavement is a street, not a lane: room for a car and a parked one)
                w = max(hard if not any(pv) else max(hard, 4.5), min(w, *(2 * (rm - pv[k]) for k, rm in enumerate(room) if rm is not None)))
            fits.append((float(round(w * 2) / 2), round(pv[0], 1), round(pv[1], 1)))
        # a stretch shorter than 30 m takes the width of the street before it (or after, at the
        # start), so a street doesn't change width every few metres; but where it's the narrower
        # (squeezed by a wall or a house), it's the street beside it that narrows, for the 30 m
        # round the squeeze, so the street is never widened into what made it narrow
        along = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(p, axis=0), axis=1))])
        for _ in range(4 * len(fits)):      # (each round only ever narrows, so it settles)
            runs, start = [], 0
            for i in range(1, len(fits) + 1):
                if i == len(fits) or fits[i] != fits[start]: runs.append((start, i)); start = i
            if len(runs) < 2: break
            short = [k for k, (a_, b_) in enumerate(runs) if along[min(b_, len(p) - 1)] - along[a_] < 30]
            if not short: break
            k = min(short, key=lambda k: along[min(runs[k][1], len(p) - 1)] - along[runs[k][0]])
            j = k - 1 if k else 1
            mine, theirs = fits[runs[k][0]], fits[runs[j][0]]
            if all(a_ >= b_ for a_, b_ in zip(mine, theirs)):
                for i in range(*runs[k]): fits[i] = theirs
                continue
            # (the squeeze grows out over its neighbours, nearest points first, to 30 m)
            a_, b_ = runs[k]
            while along[min(b_, len(p) - 1)] - along[a_] < 30 and (a_ > 0 or b_ < len(fits)):
                if a_ > 0 and (b_ >= len(fits) or along[a_] - along[a_ - 1] <= along[min(b_ + 1, len(p) - 1)] - along[min(b_, len(p) - 1)]):
                    a_ -= 1
                else: b_ += 1
            for i in range(a_, min(b_, len(fits))): fits[i] = tuple(min(x, y) for x, y in zip(fits[i], mine))
        base = (float(w0), pave0, pave0)
        if all(f == base for f in fits):
            out.append(r); continue
        narrowed += 1
        start = 0
        for i in range(1, len(pts) + 1):
            if i == len(pts) or fits[i] != fits[start]:
                piece = pts[max(0, start - 1):i]      # each piece starts where the one before ended
                w, pl, pr = fits[start]
                extra = {} if fits[start] == base else dict(w=w, pv=[pl, pr])
                if len(piece) > 1: out.append(dict(r, p=piece, **extra))
                start = i
    return out, narrowed
