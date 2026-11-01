"""Corridors: the space a street or path takes up, fitted between what stands either side.

What a street is made of comes from the data's tags (its width, its lanes, its pavements), but
the tags are patchy and often wrong, so the tags are only observations. The corridor is the ground
the street can actually have: for every sample along the centre line, how far away the first
thing that stands up is (a building front, a lidar ridge, a mapped barrier) looked at square to
the centre line, each side, median-filtered over a dozen metres. One cross-section is fitted into
that corridor per stretch (a carriageway width and two pavement widths), changing only where the
fitted values really change or where the corridor does, with a short taper between stretches, so a
street's width and pavements never step at a junction or mid-piece.

This is where the POC's numbers come from that must not get worse: no mid-street pavement step,
and (stage 3) carriageway widths that hold up on tagged streets with the tag hidden.
"""
import math
import statistics

import numpy as np
from shapely.geometry import LineString, Polygon

PRIOR = {
    "trunk": (7.3, 6.0), "primary": (7.3, 5.5), "secondary": (6.5, 5.5), "tertiary": (6.0, 5.0),
    "residential": (5.5, 3.5), "unclassified": (5.0, 3.5), "living_street": (4.8, 3.5),
    "service": (3.0, 2.5), "pedestrian": (4.0, 3.0),
}
# A service road's own kind (OpenStreetMap's `service`, and `access=private`): a drive to a house or
# an alley between walls is one narrow lane. An aisle through a car park keeps a service road's width:
# made wider, it was cut differently where it meets the buildings round the car park and ran into them.
SERVICE_PRIOR = {"driveway": (2.7, 2.2), "alley": (2.8, 2.0), "parking_aisle": PRIOR["service"]}
PAVE = (2.0, 1.2)               # pavement (ideal, minimum)
PATHS = {"footway", "path", "cycleway", "bridleway", "steps", "track"}
# The room a path's corridor takes between the plots: the path and the verge either side of it.
PATHW = {"footway": 1.8, "path": 1.5, "cycleway": 2.5, "bridleway": 2.5, "steps": 1.8, "track": 3.0}
# The path drawn in that room, where it has no width tag of its own: each the widest value that fits
# the build's own input's tagged paths best (within a metre of the tag along the most length). The
# tagged footways have a median of 1.0 to 1.1 m.
PATH_DRAWN = {"footway": 1.5, "path": 1.5, "cycleway": 2.2, "bridleway": 2.0, "steps": 1.8, "track": 3.0}
PATH_NARROWEST = 0.8


def _longest(obs, key):
    """The value of `key` over most of an edge's length, or None."""
    seen = {}
    for t0, t1, tags in obs or ():
        if tags.get(key):
            seen[tags[key]] = seen.get(tags[key], 0.0) + t1 - t0
    return max(sorted(seen), key=seen.get) if seen else None


def service_kind(cls, obs=()):
    """What sort of service road an edge is: driveway, alley, parking_aisle, private (a service road
    with no kind of its own that the public may not use, which in Bath is a drive) or None."""
    if cls != "service":
        return None
    kind = _longest(obs, "service")
    if kind in SERVICE_PRIOR:
        return kind
    return "private" if _longest(obs, "access") in ("private", "no") else None


def path_width(cls, obs=()):
    """The width a path is drawn: its own `width` tag where it has one (the longest-tagged, if
    several), else `PATH_DRAWN`'s for its kind, and never wider than its corridor's room."""
    room = PATHW.get(cls, 1.8)
    best, longest = None, 0.0
    for t0, t1, tags in obs or ():
        try:
            w = float(str(tags.get("width", "")).replace("m", "").strip())
        except ValueError:
            continue
        if t1 - t0 > longest:
            best, longest = w, t1 - t0
    if best is None:
        return min(room, PATH_DRAWN.get(cls, room))
    return min(room, max(PATH_NARROWEST, best))
REACH = 14.0                    # metres looked out from a centre line for what stands beside the street
LANE = 3.25                     # metres a lane is assumed wide for a "lanes" tag
STEP = 2.0                      # metres between cross-section samples
CHANGE = 0.5                    # metres: a fitted value differing by this much starts a new stretch
SHORT = 25.0                    # metres: a shorter stretch is merged into its neighbour
TAPER = 4.0                     # metres each side a cross-section blends into the next
CORNER_TURN = 10.0              # degrees a way turns at one of its points for that point to be a corner
# Streets laid along their own corners as well as the paths: the pedestrian ones, which the game
# draws as paths. A lane or yard is fitted to the carriageway between the buildings instead, and
# along its own line it met the buildings a car park's aisles run under or beside.
CORNERED = {"pedestrian"}


def line_corners(line, cls):
    """How far along `line` each of its own corners is, where the way turns by more than
    `CORNER_TURN`. Sampled only every few metres, a path cut its bends: a dog-leg between two
    gardens folded into a diagonal through both, and a twitten took its corner through the building
    it turns round. A flight of steps keeps every corner, since it turns at its landings."""
    cs = list(line.coords)
    out, run = [], 0.0
    for a, b, c in zip(cs, cs[1:], cs[2:]):
        run += math.dist(a[:2], b[:2])
        if cls == "steps" or _turn(a, b, c) > CORNER_TURN:
            out.append(run)
    return out


def _turn(a, b, c):
    """Degrees the way turns at b, coming from a and going on to c."""
    h1 = math.atan2(b[1] - a[1], b[0] - a[0])
    h2 = math.atan2(c[1] - b[1], c[0] - b[0])
    return abs(math.degrees((h2 - h1 + math.pi) % (2 * math.pi) - math.pi))


def side_reach(line, obstacles_tree, obstacles, step=STEP):
    """For each sample along line: distance to the first obstacle looked at square to it, each side
    (left, right), or None. Median-filtered over 12 m."""
    n = max(2, int(line.length / step) + 1)
    ts = np.linspace(0, line.length, n)
    out = []
    for t in ts:
        p = line.interpolate(t)
        a = line.interpolate(max(0, t - 1)); b = line.interpolate(min(line.length, t + 1))
        d = np.array([b.x - a.x, b.y - a.y]); L = np.hypot(*d)
        if L == 0:
            out.append((None, None)); continue
        d /= L; nrm = np.array([-d[1], d[0]])
        res = []
        for s in (1, -1):
            ray = LineString([(p.x + nrm[0] * s * 0.3, p.y + nrm[1] * s * 0.3),
                              (p.x + nrm[0] * s * REACH, p.y + nrm[1] * s * REACH)])
            best = None
            for k in sorted(int(k) for k in obstacles_tree.query(ray)):
                g = obstacles[k]
                if not g.intersects(ray):
                    continue
                x = g.intersection(ray)
                dist = x.distance(p)
                if best is None or dist < best:
                    best = dist
            res.append(best)
        out.append(tuple(res))

    def medf(vals):
        r = []
        for i in range(len(vals)):
            w = [v for v in vals[max(0, i - 3):i + 4] if v is not None]
            r.append(statistics.median(w) if len(w) >= 3 else None)
        return r

    L = medf([o[0] for o in out]); R = medf([o[1] for o in out])
    return ts, L, R


def fit_cross_section(edge, ts, L, R, hold_out=False, hard=None):
    """One cross-section per stretch: carriageway width w and pavements (pl, pr), fitted into the
    corridor (L, R: what stands either side). Tags are observations; hold_out ignores width tags.

    `hard` is the corridor to buildings and mapped barriers alone (Lh, Rh). Where it is given, a
    street with a width tag is fitted to it instead: a lidar wall run inside a measured street is a
    hedge leaning out, a row of parked vans or a run a little out of place."""
    cls = edge["cls"]
    ideal, minimum = PRIOR.get(cls, (5.0, 3.5))
    kind = service_kind(cls, edge.get("obs"))
    if kind:
        ideal, minimum = SERVICE_PRIOR.get(kind, SERVICE_PRIOR["driveway"])

    def obs_at(t, key):
        for t0, t1, tags in edge["obs"]:
            if t0 - 0.01 <= t <= t1 + 0.01 and key in tags:
                return tags[key]
        return None

    want_w, want_pl, want_pr, tagged, both = [], [], [], [], []
    for t in ts:
        w, measured = ideal, False
        lanes = obs_at(t, "lanes"); width = None if hold_out else obs_at(t, "width")
        # parsed apart: a lanes tag like "2;1" must not hide a good width beside it
        if lanes:
            try:
                w = max(minimum, float(lanes) * LANE)
            except ValueError:
                pass
        if width:
            try:
                w, measured = float(width), True
            except ValueError:
                pass
        pl = pr = PAVE[0]
        sw = obs_at(t, "sidewalk")
        if sw == "left":
            pr = 0
        elif sw == "right":
            pl = 0
        elif sw in ("no", "none"):
            pl = pr = 0
        swl, swr = obs_at(t, "sidewalk:left"), obs_at(t, "sidewalk:right")
        if swl == "no":
            pl = 0
        if swr == "no":
            pr = 0
        if cls in ("service", "track"):
            pl = pr = 0
        want_w.append(w); want_pl.append(pl); want_pr.append(pr); tagged.append(measured)
        both.append(sw == "both" or (swl == "yes" and swr == "yes"))
    fit = []
    for i, t in enumerate(ts):
        w, pl, pr = want_w[i], want_pl[i], want_pr[i]
        l, r = L[i], R[i]
        hl = l - 0.4 if l is not None else None      # keep 0.4 m clear of what stands there
        hr = r - 0.4 if r is not None else None
        if hard is not None and tagged[i]:
            gl, gr = hard[0][i], hard[1][i]
            hl = gl - 0.4 if gl is not None else None
            hr = gr - 0.4 if gr is not None else None
        def settle(w, pl, pr, slides):
            sh = 0.0                               # how far the street lies left of its line
            for _ in range(8):
                tl, tr = w / 2 + sh + pl, w / 2 - sh + pr
                over_l = hl is not None and tl > hl; over_r = hr is not None and tr > hr
                if not over_l and not over_r:
                    break
                if w > ideal:
                    w = ideal; continue               # 1. a tagged extra width goes first
                # 2. a centre line drawn off the middle of the street: it slides over to where there's
                # room, up to a quarter of its width, rather than lose a pavement the map says it has
                if slides and over_l != over_r:
                    room = (hr if over_l else hl)
                    room = (REACH - 0.4 if room is None else room) - (tr if over_l else tl)
                    slide = min(tl - hl if over_l else tr - hr, room, w / 4 - abs(sh))
                    if slide > 0.05:
                        sh += -slide if over_l else slide; continue
                if over_l and pl > PAVE[1]:
                    pl = max(PAVE[1], hl - w / 2 - sh); continue
                if over_r and pr > PAVE[1]:
                    pr = max(PAVE[1], hr - w / 2 + sh); continue
                if over_l and pl > 0:
                    pl = 0; continue                  # 3. the pavement on the tighter side goes
                if over_r and pr > 0:
                    pr = 0; continue
                if w > minimum:                            # 4. the carriageway narrows to its minimum
                    w = max(minimum, min(2 * (h - k * sh) for h, k in ((hl, 1), (hr, -1)) if h is not None)); continue
                break
            return [w, pl, pr, sh]
        got = settle(w, pl, pr, both[i])
        if got[3] and ((pl and not got[1]) or (pr and not got[2])):
            got = settle(w, pl, pr, False)      # (a slide that saves no pavement isn't made)
        w, pl, pr, sh = got
        fit.append([w, pl, pr, sh])
    fit = np.array(fit)
    out = []; i = 0; n = len(ts)
    while i < n:
        j = i
        while j + 1 < n and np.all(np.abs(fit[j + 1] - fit[i]) < CHANGE * np.array([1, 1, 1, 2])):
            j += 1
        out.append([ts[i], ts[j], fit[i:j + 1]]); i = j + 1
    merged = []
    for s in out:
        if merged and (s[1] - s[0] < SHORT or merged[-1][1] - merged[-1][0] < SHORT):
            merged[-1] = [merged[-1][0], s[1], np.vstack([merged[-1][2], s[2]])]
        else:
            merged.append(s)
    stretches = [(t0, t1, np.median(v, axis=0).tolist()) for t0, t1, v in merged]
    sec = np.zeros((n, fit.shape[1]))
    for k, (t0, t1, v) in enumerate(stretches):
        for i, t in enumerate(ts):
            if t0 <= t <= t1:
                sec[i] = v
    for k in range(1, len(stretches)):
        tb = stretches[k][0]; a = np.array(stretches[k - 1][2]); b = np.array(stretches[k][2])
        for i, t in enumerate(ts):
            if tb - TAPER <= t <= tb + TAPER:
                f = (t - (tb - TAPER)) / (2 * TAPER); sec[i] = a * (1 - f) + b * f
    return stretches, sec


def offset_poly(line, ts, left, right):
    """The polygon between the left and right offsets of line at the samples ts (metres)."""
    lp, rp = [], []
    for i, t in enumerate(ts):
        p = line.interpolate(t)
        a = line.interpolate(max(0, t - 1)); b = line.interpolate(min(line.length, t + 1))
        d = np.array([b.x - a.x, b.y - a.y]); L = np.hypot(*d)
        if L == 0:
            continue
        d /= L; nrm = np.array([-d[1], d[0]])
        lp.append((p.x + nrm[0] * left[i], p.y + nrm[1] * left[i]))
        rp.append((p.x - nrm[0] * right[i], p.y - nrm[1] * right[i]))
    if len(lp) < 2:
        return Polygon()
    pg = Polygon(lp + rp[::-1])
    return pg if pg.is_valid else pg.buffer(0)
