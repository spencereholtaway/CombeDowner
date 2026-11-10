"""Roads graded as roads are built: one long profile for the whole network, fitted to the survey,
with every junction at one height, no stretch steeper than its kind of road may be, and the ground
then cut or filled to it (tools/prep_map.py flattens and banks it). Shared by tools/prep_map.py
and tools/structures.py.

- terrain_detail: how fine the terrain really is, in metres, measured from its own heights. The UK's
  lidar has detail down to its pixels; terrain from a radar survey (the SRTM, under Mapzen's tiles
  outside the UK) is a coarser grid smoothed up to the pixels, and has buildings and trees in it.
- grade: the heights along every road at once, as a linear programme (scipy's HiGHS). It keeps each
  point as near its survey height as it can (by the metres of road off it, so a bump in the survey
  is cut through rather than followed), keeps every stretch within its steepest grade where the
  fixed points allow, and charges for each change of gradient, so a bump narrower than about four
  times `scale` metres is evened out and anything wider is followed. `scale` comes from
  terrain_detail: on lidar it is a few metres and the roads stay where the survey has them; on a
  coarse survey it is tens of metres, which takes out the buildings and the cross-slope a road
  laid along a hillside picks up.
"""
import numpy as np

# metres: the heights are written to a tenth of a metre, so two ends of a stretch can each move by
# half that; a stretch is graded that much inside its steepest, less the little a stretch of road
# may be over it anyway (tools/check_map.py)
ROUNDING = 0.1
# metres: a survey with no detail finer than this (terrain_detail) cannot see the gap under a
# road's bridge, so two ways crossing it at different heights with no bridge in the data are the
# grading cutting one through a bump in the survey, not one passing over the other
COARSE = 8.0
# the cost each point's height adds to break ties between equally good gradings (`grade`): above the
# solver's tolerance (1e-7), and twenty thousand times less than a point standing a metre off its survey
TIE = 1e-4


def terrain_detail(dem, px, least=1.3):
    """The finest scale (metres) at which the terrain `dem` (a grid, or a stack of grids, of pixels
    `px` metres apart) has detail of its own: the smallest scale at which its curvature still grows
    as the scale shrinks. A grid sampled up from a coarser one has no more curvature below that
    scale than at it. The sea, flat to the survey, is left out."""
    dem = np.asarray(dem, dtype=float)
    if dem.ndim == 2:
        dem = dem[None]
    gy, gx = np.gradient(dem, axis=(1, 2))
    land = np.hypot(gx, gy) > 1e-3
    curv = []
    for s in (1, 2, 4, 8, 16):
        if min(dem.shape[1:]) <= 2 * s + 1:
            break
        a = np.abs(dem[:, 2 * s:, :] + dem[:, :-2 * s, :] - 2 * dem[:, s:-s, :])[land[:, s:-s, :]]
        b = np.abs(dem[:, :, 2 * s:] + dem[:, :, :-2 * s] - 2 * dem[:, :, s:-s])[land[:, :, s:-s]]
        if not a.size or not b.size:
            break
        curv.append((s, (np.median(a) + np.median(b)) / 2 / s ** 2))
    for (s, c), (_, c2) in zip(curv, curv[1:]):
        if c >= least * c2:
            return s * px
    return curv[-1][0] * px if curv else px


def grade(chains, xy, target, fixed, steepest, scale, half=None, exact=None, join=2.5, hard=1e4, layer=None, survey=None):
    """The graded heights of a network of roads.

    chains: lists of point ids along each road; xy[id], target[id] (the survey's height there);
    fixed: {id: height} for points that keep theirs (a bridge's deck, a tunnel's floor); steepest:
    for each chain, the steepest grade allowed for each of its stretches. Points from different
    chains at the same place (to half a metre) are one junction, unless their survey heights are
    `join` metres apart or more (a road passing under a bridge). half: each chain's half width;
    with it, two loose points of the network whose carriageways overlap (the two legs of a hairpin
    bend, two roads side by side) are one surface, held within their grade of each other across
    the gap, unless the survey has them `join` metres apart (a lane along the top of a cutting).
    exact: like steepest, the steepest each stretch's kind of road may be; a stretch held to that is
    kept far enough inside it not to round over it (ROUNDING), and a gentler limit (the hill's)
    needn't be kept so closely.
    layer: {id: True or False} for points that are (True) or are not (False) inside a tunnel; two
    such points on different layers are never one junction, however close their heights (a road
    crossing over a shallow tunnel at a point the data gives both). A point without one joins any.
    survey: {id: height} to tell junctions apart by instead of target, where target has been evened
    out along each road (a steep path's end, evened out, can stand metres off the street it meets).
    Returns {id: height}."""
    from scipy.optimize import linprog
    from scipy.sparse import coo_matrix

    key = lambda i: (round(xy[i][0] * 2), round(xy[i][1] * 2))
    ref = target if survey is None else survey
    groups = {}
    node = {}
    count = 0
    for ch in chains:
        for i in ch:
            if i in node:
                continue
            here = groups.setdefault(key(i), [])
            lay = None if layer is None else layer.get(i)
            for n, h, ls in here:
                if abs(h - ref[i]) < join and (lay is None or not ls - {lay}):
                    node[i] = n
                    if lay is not None:
                        ls.add(lay)
                    break
            else:
                node[i] = count
                here.append((count, ref[i], set() if lay is None else {lay}))
                count += 1
    nn = count
    if nn == 0:
        return {}
    tz = np.zeros(nn)
    cnt = np.zeros(nn)
    for i, n in node.items():
        tz[n] += target[i]
        cnt[n] += 1
    tz /= np.maximum(cnt, 1)
    lo, hi = np.full(nn, -np.inf), np.full(nn, np.inf)
    for i, h in fixed.items():
        if i in node and np.isinf(lo[node[i]]):
            lo[node[i]] = hi[node[i]] = h
    weight = np.zeros(nn)
    edges, bends = {}, []
    for c, (ch, lim) in enumerate(zip(chains, steepest)):
        run = []
        for m, i in enumerate(ch):
            if run and node[i] == run[-1][0]:
                continue
            g = lim[min(m, len(lim) - 1)] if lim else 0.25
            tight = exact is None or not exact[c] or g >= exact[c][min(m, len(exact[c]) - 1)] - 1e-9
            run.append((node[i], i, (g, tight)))
        for (a, ia, g), (b, ib, _) in zip(run, run[1:]):
            d = float(np.hypot(xy[ib][0] - xy[ia][0], xy[ib][1] - xy[ia][1]))
            if d < 0.01:
                continue
            weight[a] += d / 2
            weight[b] += d / 2
            e = (min(a, b), max(a, b))
            edges[e] = (d, min(g, edges[e][1]) if e in edges else g)
        for (a, ia, _), (b, ib, _), (c, ic, _) in zip(run, run[1:], run[2:]):
            d1 = float(np.hypot(xy[ib][0] - xy[ia][0], xy[ib][1] - xy[ia][1]))
            d2 = float(np.hypot(xy[ic][0] - xy[ib][0], xy[ic][1] - xy[ib][1]))
            if d1 >= 0.5 and d2 >= 0.5 and len({a, b, c}) == 3:
                bends.append((a, b, c, d1, d2))
    if half is not None:
        import shapely
        reach = np.zeros(nn)
        lim = np.zeros(nn)
        where = np.zeros((nn, 2))
        for ch, h, g in zip(chains, half, steepest):
            for m, i in enumerate(ch):
                n = node[i]
                reach[n] = max(reach[n], h)
                lim[n] = max(lim[n], g[min(m, len(g) - 1)] if g else 0.25)
                where[n] = xy[i]
        loose = np.isinf(lo)
        pts = shapely.points(where)
        tree = shapely.STRtree(pts)
        a_, b_ = tree.query(pts, predicate="dwithin", distance=2 * reach.max())
        for a, b in zip(a_.tolist(), b_.tolist()):
            if a >= b or not (loose[a] and loose[b]) or (a, b) in edges or abs(tz[a] - tz[b]) >= join:
                continue
            d = float(np.hypot(*(where[a] - where[b])))
            if 0.5 <= d < reach[a] + reach[b]:
                edges[(a, b)] = (d, (max(lim[a], lim[b]), True))
    ne, nb = len(edges), len(bends)
    # variables: z, above, below (each point's height off its survey), slack (each stretch's
    # height past its steepest), bend (each point's change of gradient)
    oz, oa, ob, os_, oq = 0, nn, 2 * nn, 3 * nn, 3 * nn + ne
    nv = oq + nb
    lam = scale * scale
    c = np.concatenate([np.zeros(nn), weight, weight, np.full(ne, hard), np.full(nb, lam)])
    # Where several gradings cost the same, the solver's pick depends on the order it meets the
    # whole city's roads in, so a road added in one place moved heights by centimetres (and now and
    # then by a metre) kilometres away. A cost far too small to matter otherwise makes one grading the
    # cheapest wherever it is solved from: the lower of two, which digs rather than fills, each
    # point's share drawn from where it is so that no two gradings still tie.
    where = np.zeros((nn, 2))
    for i, n in node.items():
        where[n] = xy[i]
    cell = np.round(where * 2).astype(np.int64)
    u = ((cell[:, 0] * 73856093) ^ (cell[:, 1] * 19349663)) % 1000003 / 1000003.0
    c[oz:oz + nn] += TIE * (0.5 + u)
    c[oa:oa + nn] += TIE * u
    c[ob:ob + nn] += TIE * (1 - u)
    # equalities: z - above + below = survey
    r = np.concatenate([np.arange(nn)] * 3)
    cc = np.concatenate([oz + np.arange(nn), oa + np.arange(nn), ob + np.arange(nn)])
    v = np.concatenate([np.ones(nn), -np.ones(nn), np.ones(nn)])
    A_eq = coo_matrix((v, (r, cc)), shape=(nn, nv)).tocsr()
    rows, cols, vals, rhs = [], [], [], []
    k = 0
    for e, ((a, b), (d, (g, tight))) in enumerate(edges.items()):
        rise = max(g * d - max(0.0, ROUNDING - 0.02 * d), g * d / 2) if tight else g * d
        for s in (1, -1):
            rows += [k, k, k]
            cols += [oz + b, oz + a, os_ + e]
            vals += [s, -s, -1.0]
            rhs.append(rise)
            k += 1
    for t, (a, b, cn, d1, d2) in enumerate(bends):
        for s in (1, -1):
            rows += [k, k, k, k]
            cols += [oz + cn, oz + b, oz + a, oq + t]
            vals += [s / d2, -s * (1 / d2 + 1 / d1), s / d1, -1.0]
            rhs.append(0.0)
            k += 1
    A_ub = coo_matrix((vals, (rows, cols)), shape=(k, nv)).tocsr()
    bounds = np.column_stack([np.concatenate([lo, np.zeros(nv - nn)]), np.concatenate([hi, np.full(nv - nn, np.inf)])])
    # (heights measured from the lowest point, so the solver's tolerances are in metres of relief)
    base = float(np.nanmin(tz))
    b_eq = tz - base
    bounds[:nn] -= base
    res = linprog(c, A_ub=A_ub, b_ub=np.array(rhs), A_eq=A_eq, b_eq=b_eq,
                  bounds=[(None if np.isinf(a) else a, None if np.isinf(b) else b) for a, b in bounds], method="highs")
    if res.status != 0:
        raise RuntimeError(f"grading the roads failed: {res.message}")
    z = res.x[:nn] + base
    return {i: float(z[n]) for i, n in node.items()}
