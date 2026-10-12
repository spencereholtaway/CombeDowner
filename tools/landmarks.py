"""Landmarks that are built by hand rather than guessed: the Royal Crescent and the Circus.

Each landmark is a terrace facing a named street. Its fronts are the footprint edges that face
that street, joined into runs along it. The game dresses the fronts with the landmark's real
facade (columns, cornice, balustrade or acorns); here the houses behind are made one height,
with one roofline, as they are.

- The Royal Crescent (John Wood the Younger, 1767-74): 30 houses in a half ellipse about 150 m
  across. A rusticated ground floor, then 114 giant Ionic columns through the two floors above,
  an entablature and a balustrade. It looks over a lawn kept apart from the park by a ha-ha.
- The Circus (John Wood the Elder, 1754-68): three curved terraces round a circle, broken by
  Gay Street, Brock Street and Bennett Street. Three storeys, each with paired columns of its own
  order (Doric, Ionic, Corinthian) under a frieze, and stone acorns along the parapet. Giant
  plane trees fill the lawn in the middle.
"""
import math
import numpy as np

# eaves: top of the cornice above the facade's base level; parapet: above that
SPECS = {
    "crescent": dict(eaves=14.0, parapet=1.1, storeys=3),
    "circus": dict(eaves=12.6, parapet=1.0, storeys=3),
}


def _segments(roads, street):
    segs = []
    for r in roads:
        if r["n"] != street or r["c"] in ("footway", "path", "steps", "cycleway", "pedestrian"):
            continue
        p = r["p"]
        segs += [(p[i][:2], p[i + 1][:2]) for i in range(len(p) - 1)]
    return segs


def _nearest(segs, x, y):
    """Nearest point on the street to (x, y): (distance, point, position along the street)."""
    best, along = (1e9, None, 0.0), 0.0
    for (ax, ay), (bx, by) in segs:
        vx, vy = bx - ax, by - ay
        l2 = vx * vx + vy * vy or 1e-9
        t = min(1.0, max(0.0, ((x - ax) * vx + (y - ay) * vy) / l2))
        px, py = ax + vx * t, ay + vy * t
        d = math.hypot(x - px, y - py)
        if d < best[0]:
            best = (d, (px, py), along + t * math.sqrt(l2))
        along += math.sqrt(l2)
    return best


def find(kind, street, blds, roads, reach=24.0):
    """Fronts of the terrace facing `street`: ([dict(p=[x, y]..., s=side)], {building: [front edge]}).

    s is +1 when the street is to the left of the run (looking along it), else -1. A building's
    front edges are indexes into its outer ring (edge i runs from point i to point i + 1)."""
    segs = _segments(roads, street)
    if not segs:
        raise SystemExit(f"landmark {kind}: no street called {street!r}")
    edges = []
    for bi, b in enumerate(blds):
        ring = b["r"][0]
        area2 = sum(ring[i][0] * ring[(i + 1) % len(ring)][1] - ring[(i + 1) % len(ring)][0] * ring[i][1] for i in range(len(ring)))
        sign = 1 if area2 > 0 else -1          # outward normal of edge (a -> b) is sign * (dy, -dx)
        for i in range(len(ring)):
            (ax, ay), (bx, by) = ring[i], ring[(i + 1) % len(ring)]
            L = math.hypot(bx - ax, by - ay)
            if L < 0.8:
                continue
            nx, ny = sign * (by - ay) / L, sign * -(bx - ax) / L
            mx, my = (ax + bx) / 2, (ay + by) / 2
            d, (px, py), s = _nearest(segs, mx, my)
            if d > reach or d < 1:
                continue
            if nx * (px - mx) / d + ny * (py - my) / d < 0.8:
                continue                       # not facing the street
            _, _, sa = _nearest(segs, ax, ay)
            _, _, sb = _nearest(segs, bx, by)
            a, b = ([ax, ay], [bx, by]) if sa <= sb else ([bx, by], [ax, ay])
            side = 1 if (-(b[1] - a[1]) * nx + (b[0] - a[0]) * ny) > 0 else -1
            edges.append((s, a, b, side, (bi, i)))
    # join edges into runs along the street; a gap of more than 2.5 m (a side street) starts a new run
    edges.sort(key=lambda e: e[0])
    runs = []
    for _, a, b, side, edge in edges:
        if runs and math.dist(runs[-1]["p"][-1], a) < 2.5:
            runs[-1]["p"].append(b)
        else:
            runs.append(dict(p=[a, b], s=side, e=[]))
        runs[-1]["e"].append(edge)
    # keep the terrace itself: neighbours that happen to face the street too make short runs
    length = lambda r: sum(math.dist(p, q) for p, q in zip(r["p"], r["p"][1:]))
    longest = max(map(length, runs), default=0)
    runs = [r for r in runs if length(r) > longest / 4]
    fronts = {}
    for r in runs:
        for bi, i in r.pop("e"):
            fronts.setdefault(bi, []).append(i)
    return runs, fronts


def circle(roads, street):
    """Centre and radius of a street that runs round a circle (least squares)."""
    pts = np.array([p for (a, b) in _segments(roads, street) for p in (a, b)])
    A = np.c_[2 * pts[:, 0], 2 * pts[:, 1], np.ones(len(pts))]
    cx, cy, c = np.linalg.lstsq(A, (pts ** 2).sum(1), rcond=None)[0]
    return float(cx), float(cy), float(math.sqrt(c + cx * cx + cy * cy))
