"""The ground as one sheet (`gs` in a square's file): the open ground meets the street, pavement and
path faces at their edges, instead of being drawn under them and let down out of sight.

The game draws `gs` unless `?ground=old` (web/src/world.ts), its open ground triangulated round the
faces (web/src/sheet.ts buildSheetCdt; `Land` here fills cell by cell, as `?ground=sheet` does, and
tools/check_more.py swaps in the game's triangles); a square without it draws the ground as before,
from the grid and the faces (`sf`), which `gs` leaves as they are. docs/plans/ground-architecture.md, sections 4.2 to 4.7, is the design; what was built
differently from it, and why, is written up there under stage 3.

What the sheet is made of:
  - the faces (`sf`), drawn at their written heights: streets level across, pavements a kerb up,
    paths level across and following the hill along their length;
  - the railway's bed (`sf` "bed"), drawn as ballast just over the line's own ballast, where the line
    runs on the ground, up to its tunnels' mouths: the ground meets it like any other face;
  - the ground grid (`t`), drawn as it is, in every cell no face touches (with the hill the game
    raises over the canal's tunnels, `tunnel_hills`, which the sheet's moves are measured from);
  - in a cell a face's edge passes through, the ground is only what lies outside the faces, and it
    meets each face's edge at the face's own drawn height, so nothing of the ground is drawn under a
    face and no edge stands off the ground;
  - beside each face the ground is carved down or built up to meet it, no steeper than 1 in 1.5 cut
    or 1 in 2 filled, within BATTER_MOST of its edge; where meeting the face would take a wider bank
    than that (or than the bank down from a house standing above it), a low retaining wall stands
    at the face's edge for what is left over, in the
    square's own wall material (at a cliff's top, down to the cliff's foot). A flight of steps is
    sunk into the hill: the hill beside it is held up to SUNK_MOST over it by such a wall, and a
    wall within NARROW of the railway's bed below it goes down to the bed's level. A grid
    point is never built up more than FILL_MOST over the survey, nor at all within a cell and a half
    of the water or a bridge's deck, and is kept DECK_UNDER under a deck's underside, out to its
    abutments, where a face ending under the deck's end is held by a wall as an abutment.

What is baked here (`gs`), all as whole numbers so it packs small:
  n   the version of these rules;
  c   the grid cells under faces: run lengths over the cells in rows (south to north, west to
      east), starting with a run of cells that are not. A cell no free edge crosses is wholly under
      faces and draws no ground; of the cells one crosses, it marks those whose south-west corner
      is under a face;
  h   the grid points carved or built up, as steps from the point before, and hz how far each moves,
      in decimetres (the grid's own unit);
  s   the face corners where the ground meets a face's edge lower or higher than its top (a
      retaining wall), as steps from the corner before, and sz the ground's height there from the
      face's top, in centimetres;
  w   the wall the square's retaining walls are built as (its most common kind of wall);
  x   the cells where faces overlap (a free edge with another face on its open-ground side), as
      steps from the cell before: each is drawn whole as the grid, its corners let down under the
      faces in it, rather than cut (drawn as nothing, the part of it no face covers was a hole).

What is not baked, because shipping it would cost more than the 5% of a square's download the sheet
may add (measured: the ground's own triangles in the cells faces cross came to about 12%): which
triangles join those points. The game cuts each such cell along the faces' free edges and fills what
is left (web/src/sheet.ts `buildSheet`), and `Land` below does the same for the checks. Both read only what
is here and in `sf`, so they agree with each other and with every load.

Nothing here is decided over the network: it is all build-time.
"""
import math

import numpy as np
import shapely
from shapely.geometry import Polygon, box

VERSION = 1
FACE_KINDS = ("road", "service", "pave", "path", "front", "drive", "grass", "dirt", "gravel", "bed")
# how far over its written height the game draws each kind of face (web/src/world.ts FACE_LIFT); the
# railway's bed is written at the height it is drawn
LIFT = {"road": 0.07, "service": 0.07, "pave": 0.17, "path": 0.04, "front": 0.04, "drive": 0.04,
        "grass": 0.04, "dirt": 0.04, "gravel": 0.04, "bed": 0.0}
OUTLINE_LIFT = {"road": 0.07, "pave": 0.17, "path": 0.04, "front": 0.04, "drive": 0.04, "plaza": 0.04, "bed": 0.0}
BATTER_FILL = 2.0     # ground below a face's edge is built up to it no steeper than 1 in 2
BATTER_CUT = 1.5      # ground above it is cut down to it no steeper than 1 in 1.5
FILL_MOST = 1.0       # metres a grid point is ever built up over the survey: more would fill in a cutting
DECK_UNDER = 0.5      # metres the ground is kept under a deck's underside, so there is room under it
PASSAGE_RIDE = 15.0   # metres: a way riding with no span this near is in a passage, not on a bridge (check_more RIDE_SPAN)
DECK_DEPTH = {"arch": 0.9, "beam": 1.1, "truss": 0.9, "foot": 0.45, "suspension": 0.45}   # world.ts: each kind's deck
FOOT_WAYS = {"footway", "path", "cycleway", "steps", "bridleway"}
FOOT_DEPTH = 0.4      # metres under a building's ground height the ground beside it may be cut to (its walls go 0.6 down)
NARROW = 0.5          # metres: ground narrower than this between two faces' edges is the lower one's level
SUNK_MOST = 1.2       # metres of hill a flight's retaining wall holds beside it
BANK_OUT = 0.4        # metres out from a flight's edge that the hill beside it is read
BETWEEN = 1.0         # metres: ground this near faces of two kinds is between them
BATTER_MOST = 3.0     # metres: the widest bank beside a face; past that a retaining wall takes the rest
WALLS = ("wall", "retaining_wall", "stone_wall", "garden_wall", "brick_wall", "brick_wall_low", "dry_stone",
         "security_wall", "boundary_wall")
SEAM = 0.006         # metres: a face's edge this near the square's edge runs along it (corners are whole centimetres)


def unpack(sf):
    """A packed `sf` (as written) as corners (metres, and the same in whole centimetres), triangles
    with each one's kind, and the outlines as (kind, corner numbers)."""
    cm = np.cumsum(np.asarray(sf["v"], np.int64).reshape(-1, 3), axis=0)
    V = cm / 100 + [sf["o"][0], sf["o"][1], 0]
    tris, kinds = [], []
    for n, k in enumerate(FACE_KINDS):
        if sf.get(k):
            t = np.cumsum(np.asarray(sf[k], np.int64)).reshape(-1, 3)
            tris.append(t); kinds.append(np.full(len(t), n))
    T = np.concatenate(tris) if tris else np.zeros((0, 3), np.int64)
    K = np.concatenate(kinds) if kinds else np.zeros(0, int)
    E = [(e["c"], np.cumsum(np.asarray(e["i"], np.int64))) for e in sf.get("e") or []]
    return V, cm, T, K, E


def tunnel_hills(canal, T):
    """The grid's heights (decimetres over z0) with the land over the canal's tunnels raised as the
    game raises it when it loads a square (web/src/canal.ts tunnelHills, the same sums), so the sheet
    meets the faces at the ground that is drawn there."""
    h = np.asarray(T["h"], np.int64).copy()
    if not canal:
        return h
    nx, ny, dx, dy = T["nx"], T["ny"], T["dx"], T["dy"]
    x1, y1 = T["x0"] + (nx - 1) * dx, T["y0"] + (ny - 1) * dy
    for t in canal.get("tunnels") or []:
        (ax, ay), (bx, by) = t["a"], t["b"]
        if max(ax, bx) < T["x0"] - 60 or min(ax, bx) > x1 + 60 or max(ay, by) < T["y0"] - 60 or min(ay, by) > y1 + 60:
            continue
        lv, d, best = 0.0, 1, math.inf
        for r in canal["runs"]:
            for k in range(len(r["p"]) - 1):
                q, n = r["p"][k], r["p"][k + 1]
                dd = math.hypot(q[0] - (ax + bx) / 2, q[1] - (ay + by) / 2)
                if dd < best:
                    best, lv = dd, r["lv"]
                    d = 1 if (n[0] - q[0]) * (bx - ax) + (n[1] - q[1]) * (by - ay) >= 0 else -1
        L = math.hypot(bx - ax, by - ay) or 1
        ux, uy = (bx - ax) / L, (by - ay) / L
        side = t.get("tw") or 0
        lo = -(2.6 + 1.3) if side < 0 else -2.6 - 0.1
        hi = 2.6 + 1.3 if side > 0 else 2.6 + 0.1
        mid, half, wall = (lo + hi) / 2, (hi - lo) / 2, lv + 1.0
        off = mid * d
        top = wall + 2.5 + 1.5 - 0.2
        face = max(7, half + 3.5)
        reach = face + (top - lv) * 2 + 4
        i0 = max(0, math.floor((min(ax, bx) - reach - T["x0"]) / dx)); i1 = min(nx - 1, math.ceil((max(ax, bx) + reach - T["x0"]) / dx))
        j0 = max(0, math.floor((min(ay, by) - reach - T["y0"]) / dy)); j1 = min(ny - 1, math.ceil((max(ay, by) + reach - T["y0"]) / dy))
        if i0 > i1 or j0 > j1:
            continue
        I, J = np.meshgrid(np.arange(i0, i1 + 1), np.arange(j0, j1 + 1))
        x = T["x0"] + I * dx - (ax - uy * off)
        y = T["y0"] + J * dy - (ay + ux * off)
        sa, v = x * ux + y * uy, np.abs(-x * uy + y * ux)
        want = top - 0.5 * (np.maximum(0, v - face) + np.maximum(0, np.maximum(-sa, sa - L)))
        k = (J * nx + I).ravel()
        h[k] = np.maximum(h[k], np.round((want.ravel() - T["z0"]) * 10).astype(np.int64))
    return h


def grid(T, h=None):
    """The grid's heights (metres) in rows south to north, and its points' x and y."""
    nx, ny = T["nx"], T["ny"]
    H = np.asarray(T["h"] if h is None else h, float).reshape(ny, nx) / 10 + T["z0"]
    X = T["x0"] + np.arange(nx) * T["dx"]
    Y = T["y0"] + np.arange(ny) * T["dy"]
    return H, X, Y


def on_grid(H, T, x, y):
    """The grid's height at each (x, y), on its two triangles a cell as the game draws them."""
    nx, ny = T["nx"], T["ny"]
    fi, fj = (np.asarray(x, float) - T["x0"]) / T["dx"], (np.asarray(y, float) - T["y0"]) / T["dy"]
    i, j = np.clip(np.floor(fi).astype(int), 0, nx - 2), np.clip(np.floor(fj).astype(int), 0, ny - 2)
    u, v = np.clip(fi - i, 0, 1), np.clip(fj - j, 0, 1)
    a, b, c, d = H[j, i], H[j, i + 1], H[j + 1, i], H[j + 1, i + 1]
    return np.where(u + v <= 1, a + (b - a) * u + (c - a) * v, d + (c - d) * (1 - u) + (b - d) * (1 - v))


class Faces:
    """A square's faces as the sheet sees them: each corner's spot (corners at one place, a path's and
    a pavement's, are one spot), and the free edges, where a face meets open ground, each with the
    ground on its right and the drawn height of its face at either end."""

    def __init__(self, sf, bounds):
        self.V, self.cm, self.T, self.K, self.E = unpack(sf)
        V, cm = self.V, self.cm
        spot = {}
        self.spot = np.empty(len(V), np.int64)
        for i, key in enumerate(map(tuple, cm[:, :2].tolist())):
            self.spot[i] = spot.setdefault(key, i)
        # the kind of face each edge of a triangle belongs to, for how far it is lifted
        kind_of = {}
        for (a, b, c), k in zip(self.T.tolist(), self.K.tolist()):
            for p, q in ((a, b), (b, c), (c, a)):
                kind_of[(min(p, q), max(p, q))] = k
        sp = self.spot
        owner = set()
        for _, idx in self.E:
            for a, b in zip(idx[:-1].tolist(), idx[1:].tolist()):
                owner.add((sp[a], sp[b]))
        x0, y0, x1, y1 = bounds
        on_seam = lambda p, q: ((abs(p[0] - x0) < SEAM and abs(q[0] - x0) < SEAM) or (abs(p[0] - x1) < SEAM and abs(q[0] - x1) < SEAM)
                                or (abs(p[1] - y0) < SEAM and abs(q[1] - y0) < SEAM) or (abs(p[1] - y1) < SEAM and abs(q[1] - y1) < SEAM))
        free, tops, lifts = [], [], []
        for c, idx in self.E:
            run = []
            for a, b in zip(idx[:-1].tolist(), idx[1:].tolist()):
                if sp[a] == sp[b] or (sp[b], sp[a]) in owner or on_seam(V[a], V[b]):
                    continue
                k = kind_of.get((min(a, b), max(a, b)))
                lift = LIFT[FACE_KINDS[k]] if k is not None else OUTLINE_LIFT.get(c, 0.07)
                run.append((a, b, lift))
                # (an outline that runs out and straight back along itself, a spike of no width, is
                # taken as the one edge left over: the ground has nothing to fill inside it)
                while len(run) > 1 and run[-2][1] == run[-1][0] and spike(V[run[-2][0]], V[run[-1][0]], V[run[-1][1]]):
                    (a0, _, l0), (_, b1, l1) = run[-2], run[-1]
                    del run[-2:]
                    if sp[a0] != sp[b1]:
                        run.append((a0, b1, l0))
            for a, b, lift in run:
                free.append((a, b)); tops.append((V[a, 2] + lift, V[b, 2] + lift)); lifts.append(lift)
        self.free = np.asarray(free, np.int64).reshape(-1, 2)
        self.bed = {int(sp[i]) for c, idx in self.E if c == "bed" for i in idx.tolist()}
        # (a street, a pavement and a path are each lifted their own way, which tells them apart)
        self.lift = np.asarray(lifts, float)
        self.tops = np.asarray(tops, float).reshape(-1, 2)
        # each spot on a free edge, and its face's top there: the lowest of the faces meeting there
        self.top = {}
        for (a, b), (ta, tb) in zip(self.free.tolist(), self.tops.tolist()):
            for v, t in ((sp[a], ta), (sp[b], tb)):
                self.top[v] = min(self.top.get(v, math.inf), t)
        self.polys = shapely.polygons(V[self.T][:, :, :2]) if len(self.T) else np.zeros(0, object)

    def segments(self):
        a, b = self.free[:, 0], self.free[:, 1]
        return self.V[a, :2], self.V[b, :2]


def spike(a, b, c):
    """a to b then b to c runs straight back the way it came."""
    ux, uy, vx, vy = b[0] - a[0], b[1] - a[1], c[0] - b[0], c[1] - b[1]
    return ux * vx + uy * vy < 0 and abs(ux * vy - uy * vx) <= 1e-3 * math.hypot(ux, uy) * math.hypot(vx, vy)


def wall_kind(br):
    """The square's own wall, its retaining walls' look: the kind of wall most of its length is."""
    length = {}
    for b in br or []:
        if b.get("c") in WALLS and len(b["p"]) > 1:
            p = np.asarray([q[:2] for q in b["p"]], float)
            length[b["c"]] = length.get(b["c"], 0) + float(np.hypot(*np.diff(p, axis=0).T).sum())
    return max(length, key=length.get) if length else "retaining_wall"


def overlaps(F, A, B, segs, GX, GY):
    """The cells where faces overlap, so a free edge has another face, not open ground, on its right:
    cutting along the edges there would fill the wrong side. Each one's number and the lowest top of
    the faces in it."""
    d = B - A
    across = np.stack([d[:, 1], -d[:, 0]], 1) / np.maximum(np.hypot(d[:, 0], d[:, 1]), 1e-9)[:, None]
    right = (A + B) / 2 + across * 0.02
    ftree = shapely.STRtree(F.polys)
    bad = np.unique(ftree.query(shapely.points(right), predicate="within")[0])
    if not len(bad):
        return np.zeros(0, np.int64), np.zeros(0)
    boxes = shapely.box(GX[:-1, :-1].ravel(), GY[:-1, :-1].ravel(), GX[1:, 1:].ravel(), GY[1:, 1:].ravel())
    odd = np.unique(shapely.STRtree(segs[bad]).query(boxes, predicate="intersects")[0])
    top = np.zeros(len(odd))
    lift = np.asarray([LIFT[k] for k in FACE_KINDS])[F.K]
    for n, k in enumerate(odd.tolist()):
        ids = ftree.query(boxes[k], predicate="intersects")
        top[n] = float((F.V[F.T[ids], 2].min(axis=1) + lift[ids]).min())
    return odd, top


def odd_corners(F, odd, H, T, under=0.05, step=0.25, keep=None):
    """How low each corner of the cells where faces overlap must be let down, so the cell drawn whole
    as the grid stays under every face in it: each corner only as far as the faces near it need, so a
    corner the low face doesn't reach (where a bridge's deck comes down to its abutment beside the
    path passing under it) keeps its height. A corner beside a house (`keep`, by grid point: its
    walls' foot) is let down no lower than that foot wherever the faces allow it. As (grid point,
    height) pairs."""
    from scipy.optimize import linprog
    nx, dx, dy = T["nx"], T["dx"], T["dy"]
    lift = np.asarray([LIFT[k] for k in FACE_KINDS])[F.K]
    ftree = shapely.STRtree(F.polys)
    n = int(round(dx / step))
    su, sv = np.meshgrid(np.linspace(0, 1, n + 1), np.linspace(0, 1, n + 1))
    su, sv = su.ravel(), sv.ravel()
    lo_tri = su + sv <= 1
    w = np.where(lo_tri[:, None], np.stack([1 - su - sv, su, sv, 0 * su], 1),
                 np.stack([0 * su, 1 - sv, 1 - su, su + sv - 1], 1))
    out = []
    for k in odd.tolist():
        j, i = divmod(k, nx - 1)
        x0, y0 = T["x0"] + i * dx, T["y0"] + j * dy
        px, py = x0 + su * dx, y0 + sv * dy
        top = np.full(len(su), np.inf)
        for t in ftree.query(shapely.box(x0, y0, x0 + dx, y0 + dy), predicate="intersects").tolist():
            a, b, c = F.V[F.T[t]]
            det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
            if abs(det) < 1e-12:
                continue
            la = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / det
            lb = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / det
            lc = 1 - la - lb
            inside = (la >= -1e-6) & (lb >= -1e-6) & (lc >= -1e-6)
            top = np.where(inside, np.minimum(top, la * a[2] + lb * b[2] + lc * c[2] + lift[t] - under), top)
        hit = np.isfinite(top)
        if not hit.any():
            continue
        z = np.array([H[j, i], H[j, i + 1], H[j + 1, i], H[j + 1, i + 1]], float)
        ws, ts = w[hit], top[hit]
        if (ws @ z - ts).max() > 1e-3:
            # (as little as every face in the cell allows, summed over its corners, so a corner no low
            # face is near keeps its height: let down to the lowest face whole, a cell beside a
            # house left it standing in a pit; and none lower than under the lowest face)
            floor = np.minimum(z, ts.min())
            got = None
            if keep is not None:
                # (summed over the corners, the least let down can be one corner dropped a metre
                # to spare the others a little: beside a house that dug a pit under its wall)
                held = keep[[j * nx + i, j * nx + i + 1, (j + 1) * nx + i, (j + 1) * nx + i + 1]]
                if np.isfinite(held).any():
                    least = np.maximum(floor, np.minimum(held, z))
                    got = linprog(-np.ones(4), A_ub=ws, b_ub=ts, bounds=list(zip(least.tolist(), z.tolist())), method="highs")
                    if not got.success:
                        got = None
            if got is None:
                got = linprog(-np.ones(4), A_ub=ws, b_ub=ts, bounds=list(zip(floor.tolist(), z.tolist())), method="highs")
            z = got.x if got.success else floor
        for v, h in zip((j * nx + i, j * nx + i + 1, (j + 1) * nx + i, (j + 1) * nx + i + 1), z.tolist()):
            out.append((v, h - 1e-3))
    return out


def deck_lines(rd, ground, ends=()):
    """Each stretch of a way on a bridge's deck: its ends, its underside's height at each, how far
    either side of its line the ground is kept under it, and whether each end is an abutment.
    `ends`: the square's `se`, where an abutment held at its way's height lands there, not on the ground."""
    held = [e for e in ends or () if e[0] == "abutment" and len(e) > 6 and e[6] == 2]
    landed = ground

    def ground(x, y):
        e = next((e for e in held if math.dist(e[1:3], (x, y)) < 0.3), None)
        return e[3] if e is not None else landed(x, y)
    out = []
    spans = [q[:2] for r in rd or [] for q in r["p"] if len(q) > 3 and q[3] == 1]
    span_tree = shapely.STRtree(shapely.points(spans)) if spans else None
    for r in rd or []:
        p = r["p"]
        if len(p) < 2 or len(p[0]) < 3:
            continue
        on = [len(q) > 3 and q[3] in (1, 2) for q in p]
        # (a path riding with no bridge near, through a building's passage, lies on the ground: the
        # ground meets its deck's underside and isn't dug out under it, which left a pit at the wall)
        lying = all(not on[i] or (p[i][3] == 2 and (span_tree is None or not len(
            span_tree.query(shapely.Point(p[i][:2]), predicate="dwithin", distance=PASSAGE_RIDE)))) for i in range(len(p)))
        dk = r.get("dk")
        side = max(dk) if isinstance(dk, list) and dk else dk if isinstance(dk, (int, float)) else 0
        half = max((r.get("w") or 8) / 2, side) + 0.5
        kind = r.get("bt") if r.get("bt") in DECK_DEPTH else (
            "foot" if r["c"] in FOOT_WAYS else "beam" if r["c"] in ("trunk", "motorway") else "arch")
        # (its underside: the road's top, lifted as drawn, less the deck's depth)
        under = (0.07 if r["c"] not in FOOT_WAYS else 0.04) - DECK_DEPTH[kind] + (DECK_UNDER if lying else 0.0)
        # (and from its last point on the span to its abutment, where the game brings the deck down
        # to the survey's ground: the bank is dug from under it there too, as an abutment stands)
        for a in range(len(p) - 1):
            if on[a] or on[a + 1]:
                za = p[a][2] if on[a] else ground(*p[a][:2])
                zb = p[a + 1][2] if on[a + 1] else ground(*p[a + 1][:2])
                out.append((p[a][:2], p[a + 1][:2], za + under, zb + under, half, (not on[a], not on[a + 1])))
    return out


def held_ends(ends, rd):
    """Each abutment its square holds at its way's height (`se`, held 2): where it is and how high, and
    the way out from the deck there (a unit vector along the way, away from the span)."""
    out = []
    for e in ends or ():
        if e[0] != "abutment" or len(e) < 7 or e[6] != 2:
            continue
        for r in rd or ():
            p = r["p"]
            for i, q in enumerate(p):
                if math.dist(q[:2], e[1:3]) > 0.05 or (len(q) > 3 and q[3]):
                    continue
                inner = [p[j] for j in (i - 1, i + 1) if 0 <= j < len(p) and len(p[j]) > 3 and p[j][3]]
                if inner:
                    dx, dy = q[0] - inner[0][0], q[1] - inner[0][1]
                    n = math.hypot(dx, dy) or 1.0
                    out.append(((e[1], e[2], e[3]), (dx / n, dy / n)))
                    break
            else:
                continue
            break
    return out


def ends_on_faces(tile, out=0.5):
    """Each abutment held at its way's height (`se`, held 2) lands at the face it meets instead, where
    one is drawn just past the deck's end (its written height, as the deck's floor meets the street's):
    the way's own line can stand a few centimetres off the face built round it. Changes `se` in place.
    Where the decks are faces too (`dk`), those share their corners with the street at the cap and
    keep their own heights: this lands the strip an older page draws."""
    sf = tile.get("sf")
    if not sf or not sf.get("o"):
        return 0
    held = held_ends(tile.get("se"), tile.get("rd"))
    if not held:
        return 0
    V, _, T, _, _ = unpack(sf)
    if not len(T):
        return 0
    tris = shapely.polygons(V[T][:, :, :2])
    tree = shapely.STRtree(tris)
    moved = 0
    for (x, y, z), (ox, oy) in held:
        px, py = x + ox * out, y + oy * out
        hit = tree.query(shapely.Point(px, py), predicate="intersects")
        if not len(hit):
            continue
        a, b, c = V[T[int(hit[0])]]
        det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(det) < 1e-12:
            continue
        la = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / det
        lb = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / det
        h = la * a[2] + lb * b[2] + (1 - la - lb) * c[2]
        if abs(h - z) > 1.0:
            continue
        for e in tile["se"]:
            if e[0] == "abutment" and len(e) > 6 and e[6] == 2 and math.dist(e[1:3], (x, y)) < 0.05:
                e[3] = round(float(h), 2)
                moved += 1
    return moved


def decks(rd, margin):
    """Each bridge's deck, out to `margin` past its sides: the stretches of a way between points on a span."""
    out = []
    for r in rd or []:
        p = r["p"]
        on = [len(q) > 3 and q[3] in (1, 2) for q in p]
        half = (r.get("w") or 8) / 2 + margin
        for a in range(len(p) - 1):
            if on[a] or on[a + 1]:
                out.append(shapely.LineString([p[a][:2], p[a + 1][:2]]).buffer(half, cap_style="flat"))
    return out


PORTAL_OUT = 3.0     # metres out in front of a portal, where its headwall holds the hill, that a way's edge counts as going in
PORTAL_IN = 8.0      # and in past it


def in_portals(tn, bounds, x, y):
    """Which of the points (x, y) lie in a tunnel's mouth: across its headwall, from just outside the
    portal to a little way in. A tunnel cut at the square's edge has no portal there."""
    from tunnels import FACE_PAST, half_at
    out = np.zeros(len(x), bool)
    w, s, e, n = bounds
    for t in tn or []:
        p = t.get("p") or []
        if len(p) < 2:
            continue
        for k, k2 in ((0, 1), (len(p) - 1, len(p) - 2)):
            (ax, ay), (bx, by) = p[k][:2], p[k2][:2]
            if min(abs(ax - w), abs(ax - e), abs(ay - s), abs(ay - n)) < 0.5:
                continue
            l = math.hypot(bx - ax, by - ay)
            if l < 1e-6:
                continue
            ux, uy = (bx - ax) / l, (by - ay) / l
            along = (x - ax) * ux + (y - ay) * uy
            across = np.abs((x - ax) * uy - (y - ay) * ux)
            out |= (along > -PORTAL_OUT) & (along < PORTAL_IN) & (across < half_at(t, k) + FACE_PAST)
    return out


def rail_mouths_and_cuttings(rail, bounds, x, y):
    """For points (x, y) on the railway's bed: which lie across a tunnel face's mouth (the bed's end
    there, where the bore goes on into the hill), and which along a cutting up to a face, with the
    way out from the line at each (unit x, y), and the lid's height over those behind a face (else nan)."""
    from railway import CUT_REACH, CUT_BAND, LID_DEEP, portal_faces
    mouth = np.zeros(len(x), bool)
    cut = np.zeros(len(x), bool)
    ox, oy = np.zeros(len(x)), np.zeros(len(x))
    lid = np.full(len(x), np.nan)
    if not rail or not len(x):
        return mouth, cut, ox, oy, lid
    w, s, e, n = bounds
    segs = []
    for t in rail.get("tracks") or []:
        for a, b in zip(t["p"], t["p"][1:]):
            fa, fb = (a[3] if len(a) > 3 else 0), (b[3] if len(b) > 3 else 0)
            if fa == 2 and fb == 2:
                continue
            if fa == 2: a = [(a[i] + b[i]) / 2 for i in range(2)]
            if fb == 2: b = [(a[i] + b[i]) / 2 for i in range(2)]
            segs.append(shapely.LineString([a[:2], b[:2]]))
    if not segs:
        return mouth, cut, ox, oy, lid
    pts = shapely.points(x, y)
    tree = shapely.STRtree(segs)
    near = tree.query_nearest(pts, all_matches=False)[1]
    foot = shapely.line_interpolate_point(np.asarray(segs, object)[near], shapely.line_locate_point(np.asarray(segs, object)[near], pts))
    dx, dy = x - shapely.get_x(foot), y - shapely.get_y(foot)
    d = np.maximum(np.hypot(dx, dy), 1e-6)
    ox, oy = dx / d, dy / d
    for fc in portal_faces(rail.get("portals") or []):
        if not (w - CUT_REACH <= fc["x"] <= e + CUT_REACH and s - CUT_REACH <= fc["y"] <= n + CUT_REACH):
            continue
        u = (x - fc["x"]) * fc["ux"] + (y - fc["y"]) * fc["uy"]
        v = -(x - fc["x"]) * fc["uy"] + (y - fc["y"]) * fc["ux"]
        across = (v > fc["v0"] - CUT_BAND) & (v < fc["v1"] + CUT_BAND)
        # (the bed's end, past the line's last point, where the way out from it runs along the line;
        # and any of its edge in behind the face, where the ground is hidden in the bore)
        inside = (v > fc["v0"]) & (v < fc["v1"])
        mouth |= inside & (((u > -1.0) & (np.abs(ox * fc["ux"] + oy * fc["uy"]) > 0.5)) | (u > 0.0)) & (u < LID_DEEP)
        cut |= across & (u <= 0.0) & (u > -CUT_REACH)
        lid[inside & (u > 0.0) & (u < LID_DEEP)] = fc["z"] + fc["top"]
    return mouth, cut & ~mouth, ox, oy, lid


def runs(mask):
    """A row of 0s and 1s as run lengths, starting with a run of 0s."""
    out, at, n = [], 0, 0
    for v in mask.tolist():
        if v != at:
            out.append(n); at, n = v, 0
        n += 1
    out.append(n)
    return out


TREAD_LIFT = 0.04     # metres a flight's treads stand over its baked line (check_more.PATH_LIFT, furniture.ts)
TREAD_RISE = 0.16     # metres a tread climbs, where the map gives no count
TREAD_CLEAR = 0.05    # metres the ground beside a tread may stand over it before it buries the tread
HILL_OUT = (0.4, 1.0, 2.0)   # metres out from a flight's side that the hill beside it is read


def treads(r):
    """A flight's line, and the top of its treads at a distance along it, as the game lays them on
    its baked heights (furniture.ts stairLayout): each tread as high as the higher of its two ends."""
    p = r["p"]
    line = shapely.LineString([q[:2] for q in p])
    cum = np.concatenate([[0.0], np.cumsum([math.dist(a[:2], b[:2]) for a, b in zip(p, p[1:])])])
    z = np.asarray([q[2] for q in p], float) + TREAD_LIFT
    L = float(cum[-1])
    rise = abs(z[-1] - z[0])
    count = min(r.get("sc") or (round(rise / TREAD_RISE) if rise > 0.3 else 0), 240, int(L // 0.2))

    def top(s):
        s = np.clip(np.asarray(s, float), 0, L)
        if count < 1:
            return np.interp(s, cum, z)
        k = np.minimum(np.floor(s / L * count), count - 1)
        return np.maximum(np.interp(L * k / count, cum, z), np.interp(L * (k + 1) / count, cum, z))
    return line, L, top


def beside_treads(rd, F, spots, top, meet, H, T):
    """The ground where it meets a flight's sides, at its treads' height: a bank higher than the treads
    beside them is held by a retaining wall, at least a hand's breadth high, all along it; else the
    ground comes down to the treads, so the 4 m grid's slope never buries one."""
    flights = [r for r in rd if r.get("c") == "steps" and r.get("tb") and len(r["p"]) > 1
               and not any(len(q) > 3 and q[3] for q in r["p"])]
    if not flights or not len(spots):
        return meet
    laid = [treads(r) for r in flights]
    half = [(r.get("w") or 1.8) / 2 for r in flights]
    pts = shapely.points(F.V[spots, :2])
    si_, fl_ = shapely.STRtree([l.buffer(h + 0.3, cap_style="flat") for (l, _, _), h in zip(laid, half)]).query(pts, predicate="intersects")
    out = meet.copy()
    for i, k in zip(si_.tolist(), fl_.tolist()):
        line, L, at = laid[k]
        pt = pts[i]
        s = line.project(pt)
        if s <= 0.05 or s >= L - 0.05:
            continue
        foot = line.interpolate(s)
        dx, dy = F.V[spots[i], 0] - foot.x, F.V[spots[i], 1] - foot.y
        d = math.hypot(dx, dy)
        if d < half[k] * 0.5:
            continue
        tread = float(at(s))
        hill = max(float(on_grid(H, T, foot.x + dx / d * (half[k] + o), foot.y + dy / d * (half[k] + o))) for o in HILL_OUT)
        if hill > tread + TREAD_CLEAR:
            out[i] = max(out[i], min(hill, tread + SUNK_MOST), top[i] + 2 * TREAD_CLEAR)
        elif out[i] > tread + TREAD_CLEAR / 2:
            out[i] = tread
    return out


def ground_sheet(tile, canal=None, rail=None):
    """`gs` for a square as written (its `sf`, `t`, `bl`, `wp` and `br`), or None if it has no faces.
    canal: the map's canal, whose tunnels' hills the game raises over the grid before the sheet's
    moves are added to it; rail: the map's railway, whose cuttings up to its tunnels are walled."""
    sf, T = tile.get("sf"), tile["t"]
    if not sf or not sf.get("o") or not sf.get("l") or T.get("dx", 0) <= 3:
        return None
    bounds = tile["b"]
    F = Faces(sf, bounds)
    if not len(F.free):
        return None
    h0 = tunnel_hills(canal, T)
    H, X, Y = grid(T, h0)
    nx, ny = T["nx"], T["ny"]
    sp = F.spot

    # 1. the ground's height where it meets each face's edge: the face's top, unless the survey there
    # is further off it than a bank BATTER_MOST wide can make up, when a retaining wall takes the rest
    spots = np.asarray(sorted(F.top), np.int64)
    top = np.asarray([F.top[s] for s in spots.tolist()])
    g = on_grid(H, T, F.V[spots, 0], F.V[spots, 1])
    up, down = BATTER_MOST / BATTER_CUT, BATTER_MOST / BATTER_FILL
    # At a cliff's top the 4 m grid puts a face halfway down the cliff, and ground built up to meet it
    # there would bury what stands at the foot (a railway, a road), so there the wall goes to the foot;
    # but not at a bridge's end, whose ground is the approach the bridge stands on.
    cliff = np.ones(len(spots), bool)
    ends = [d.buffer(T["dx"]) for d in decks(tile.get("rd"), T["dx"] * 0.5)]
    if ends:
        cliff[shapely.STRtree(ends).query(shapely.points(F.V[spots, :2]), predicate="intersects")[0]] = False
    fi = np.clip(np.floor((F.V[spots, 0] - T["x0"]) / T["dx"]).astype(int), 0, T["nx"] - 2)
    fj = np.clip(np.floor((F.V[spots, 1] - T["y0"]) / T["dy"]).astype(int), 0, T["ny"] - 2)
    foot = np.minimum.reduce([H[fj, fi], H[fj, fi + 1], H[fj + 1, fi], H[fj + 1, fi + 1]])
    meet = np.where(g - top > up, g - up, np.where(top - g > down, np.where(cliff & (g - foot > down), foot, g + down), top))
    # A house standing above a face's edge keeps its ground: the bank down from its walls' foot reaches
    # the edge no steeper than the batter, and a retaining wall takes what is left, rather than the
    # ground beside it being cut down to the face and the grid's points along its walls left standing
    # as peaks over the cut.
    houses = [(Polygon(b["r"][0], b["r"][1:]).buffer(0), b["g"] - FOOT_DEPTH) for b in tile.get("bl") or []
              if len((b.get("r") or [[]])[0]) >= 3 and isinstance(b.get("g"), (int, float))]
    if houses:
        reach = BATTER_MOST + T["dx"]
        si_, hi_ = shapely.STRtree([h for h, _ in houses]).query(shapely.points(F.V[spots, :2]), predicate="dwithin", distance=reach)
        if len(si_):
            d = shapely.distance(shapely.points(F.V[spots[si_], :2]), np.asarray([houses[k][0] for k in hi_.tolist()], object))
            want = np.asarray([houses[k][1] for k in hi_.tolist()]) - d / BATTER_CUT
            need = np.full(len(spots), -np.inf)
            np.maximum.at(need, si_, want)
            meet = np.maximum(meet, np.where(need > top, need, -np.inf))
    # A flight of steps is sunk into the hill: the hill beside it stays as it is, up to SUNK_MOST over
    # the flight's edge, held by a retaining wall, rather than cut down to meet the treads. The hill is
    # read a little out from the edge, where the treads' ends meet it: read at the edge's own corner
    # on a 4 m grid, a bank rising just past it was carved to a slope that stood over the treads.
    lines = [shapely.LineString([q[:2] for q in r["p"]]) for r in tile.get("rd") or []
             if r.get("c") == "steps" and len(r["p"]) > 1 and not any(len(q) > 3 and q[3] for q in r["p"])]
    widths = [(r.get("w") or 1.8) / 2 for r in tile.get("rd") or []
              if r.get("c") == "steps" and len(r["p"]) > 1 and not any(len(q) > 3 and q[3] for q in r["p"])]
    if lines:
        flights = [l.buffer(w + 0.3, cap_style="flat") for l, w in zip(lines, widths)]
        pts = shapely.points(F.V[spots, :2])
        si_, fl_ = shapely.STRtree(flights).query(pts, predicate="intersects")
        on = np.zeros(len(spots), bool)
        on[si_] = True
        foot = shapely.line_interpolate_point(np.asarray(lines, object)[fl_], shapely.line_locate_point(np.asarray(lines, object)[fl_], pts[si_]))
        dx, dy = F.V[spots[si_], 0] - shapely.get_x(foot), F.V[spots[si_], 1] - shapely.get_y(foot)
        d = np.hypot(dx, dy)
        out = d > 0.05
        bank = np.full(len(spots), -np.inf)
        np.maximum.at(bank, si_[out], on_grid(H, T, F.V[spots[si_[out]], 0] + dx[out] / d[out] * BANK_OUT,
                                              F.V[spots[si_[out]], 1] + dy[out] / d[out] * BANK_OUT))
        hill = np.maximum(g, bank)
        sunk = on & (hill > top)
        meet[sunk] = np.maximum(np.minimum(hill[sunk], top[sunk] + SUNK_MOST), meet[sunk])
        meet = beside_treads(tile.get("rd") or [], F, spots, top, meet, H, T)
    # A bridge's abutment: where a face ends under a deck's end, the ground beside it is dug to the
    # room under the deck and a wall holds the face's edge, as an abutment stands at a bridge's end.
    for (ax_, ay_), (bx_, by_), za, zb, half, _ in deck_lines(tile.get("rd"), lambda x, y: float(on_grid(H, T, x, y)), tile.get("se")):
        vx_, vy_ = bx_ - ax_, by_ - ay_
        l2 = vx_ * vx_ + vy_ * vy_
        if l2 < 1e-6:
            continue
        qx, qy = F.V[spots, 0], F.V[spots, 1]
        u = ((qx - ax_) * vx_ + (qy - ay_) * vy_) / l2
        d = np.abs((qx - ax_) * vy_ - (qy - ay_) * vx_) / math.sqrt(l2)
        tol = 0.3 / math.sqrt(l2)
        k = np.nonzero((u >= -tol) & (u <= 1 + tol) & (d <= half))[0]
        bound = za + (zb - za) * np.clip(u[k], 0, 1) - DECK_UNDER
        meet[k] = np.minimum(meet[k], bound)
    # A wall at a face's edge a hand's breadth (NARROW) from the railway's bed below it goes down to
    # the bed: the ground between is too narrow to slope, and stood as a strip of grass up the foot of
    # the cutting's wall. (Not beside other faces: a pavement's wall let down to a path beside it
    # left the pavement on a lip.)
    on_bed = np.asarray([int(sp[a]) in F.bed and int(sp[b]) in F.bed for a, b in F.free.tolist()], bool)
    if on_bed.any():
        lines = shapely.linestrings(F.V[F.free[on_bed]][:, :, :2])
        ends = F.tops[on_bed]
        pts = shapely.points(F.V[spots, :2])
        si_, ei_ = shapely.STRtree(lines).query(pts, predicate="dwithin", distance=NARROW)
        keep = np.asarray([int(v) not in F.bed for v in spots[si_].tolist()], bool) if len(si_) else np.zeros(0, bool)
        si_, ei_ = si_[keep], ei_[keep]
        if len(si_):
            f = shapely.line_locate_point(lines[ei_], pts[si_], normalized=True)
            bz = ends[ei_, 0] + (ends[ei_, 1] - ends[ei_, 0]) * f
            low = (bz < top[si_] - 0.3) & (top[si_] > g[si_])
            if low.any():
                floor = np.full(len(spots), np.inf)
                np.minimum.at(floor, si_[low], bz[low])
                meet = np.minimum(meet, floor)
    # A way going into a tunnel ends at its portal with the hill standing metres over it: the
    # headwall holds that hill, and the game hides the ground in the bore's mouth, so the ground meets
    # the way's end at its own height there. A retaining wall up to the hill stood across the opening.
    at_portal = in_portals(tile.get("tn"), bounds, F.V[spots, 0], F.V[spots, 1])
    meet[at_portal] = top[at_portal]
    # The railway's bed in a cutting up to a tunnel's face, where the ground beside it is held at the
    # cutting's top (prep_map.py): a retaining wall at the bed's edge takes all of it, with no bank
    # cut down to the bed; and at the face itself the bed runs on into the bore with no wall across it.
    on_bed = np.asarray([int(v) in F.bed for v in spots.tolist()], bool)
    if rail and on_bed.any():
        from railway import CUT_DEEP
        k = np.nonzero(on_bed)[0]
        mouth, cut, ox, oy, lid = rail_mouths_and_cuttings(rail, bounds, F.V[spots[k], 0], F.V[spots[k], 1])
        meet[k[mouth]] = top[k[mouth]]
        # (behind the face the hill's ground meets the bed's end at the lid's height, over the bore:
        # the game draws no wall there, the bore's lining being its wall)
        under = mouth & ~np.isnan(lid)
        meet[k[under]] = np.maximum(top[k[under]], lid[under])
        out = on_grid(H, T, F.V[spots[k], 0] + ox * T["dx"], F.V[spots[k], 1] + oy * T["dy"])
        walled = cut & (out - top[k] >= CUT_DEEP - 1.0)
        # (not by a bridge over the cutting, whose abutments hold the ground there)
        spans = decks(tile.get("rd"), 2 * T["dx"])
        if spans:
            walled[shapely.STRtree(spans).query(shapely.points(F.V[spots[k], :2]), predicate="intersects")[0]] = False
        meet[k[walled]] = np.maximum(meet[k[walled]], out[walled])
        cut_walls = set(spots[k[walled]].tolist())
    else:
        cut_walls = set()
    meet = np.round(meet, 2)
    held = np.round((meet - top) * 100).astype(np.int64)
    hf = dict(zip(spots.tolist(), (top + held / 100).tolist()))

    # 2. the grid points beside the faces, carved down or built up to meet them
    A, B = F.segments()
    ha = np.asarray([hf[sp[a]] for a in F.free[:, 0].tolist()])
    hb = np.asarray([hf[sp[b]] for b in F.free[:, 1].tolist()])
    segs = shapely.linestrings(np.stack([A, B], axis=1))
    tree = shapely.STRtree(segs)
    GX, GY = np.meshgrid(X, Y)
    inner = np.zeros((ny, nx), bool)
    inner[1:-1, 1:-1] = True
    pts = shapely.points(GX.ravel(), GY.ravel())
    pi, si = tree.query(pts, predicate="dwithin", distance=BATTER_MOST)
    keep = inner.ravel()[pi]
    pi, si = pi[keep], si[keep]
    # (not under a building, in the water or under a face, where the grid point isn't drawn or the
    # ground isn't the faces' to shape)
    solid = [Polygon(b["r"][0], b["r"][1:]).buffer(0) for b in tile.get("bl") or [] if len((b.get("r") or [[]])[0]) >= 3]
    wet = [Polygon(w["r"][0], [h for h in w["r"][1:] if len(h) >= 3]).buffer(0) for w in tile.get("wp") or [] if len(w["r"][0]) >= 3]
    solid += wet
    blocked = np.zeros(len(pts), bool)
    if solid:
        bi, _ = shapely.STRtree(solid).query(pts, predicate="intersects")
        blocked[bi] = True
    if len(F.polys):
        fi, _ = shapely.STRtree(F.polys).query(pts, predicate="intersects")
        blocked[fi] = True
    keep = ~blocked[pi]
    pi, si = pi[keep], si[keep]
    px, py = GX.ravel()[pi], GY.ravel()[pi]
    ax, ay, bx, by = A[si, 0], A[si, 1], B[si, 0], B[si, 1]
    vx, vy = bx - ax, by - ay
    u = np.clip(((px - ax) * vx + (py - ay) * vy) / np.maximum(vx * vx + vy * vy, 1e-12), 0, 1)
    d = np.hypot(px - ax - vx * u, py - ay - vy * u)
    pair_d = d
    at = ha[si] + (hb[si] - ha[si]) * u
    lo = at - d / BATTER_FILL
    hi = at + d / BATTER_CUT
    n = nx * ny
    low = np.full(n, -np.inf); np.maximum.at(low, pi, lo)
    high = np.full(n, np.inf); np.minimum.at(high, pi, hi)
    # (two faces close by at heights no one bank meets: the nearer one has it)
    near_d = np.full(n, np.inf); np.minimum.at(near_d, pi, d)
    nearest = d <= near_d[pi]
    own_lo = np.full(n, -np.inf); own_hi = np.full(n, np.inf)
    own_lo[pi[nearest]] = lo[nearest]; own_hi[pi[nearest]] = hi[nearest]
    clash = low > high
    low[clash], high[clash] = own_lo[clash], own_hi[clash]
    # (between faces of two kinds, a street and a path say, within a metre of both, the ground is no
    # higher than the higher of them: a bank cut down to each stood up as a lump between them)
    close = d <= BETWEEN
    if close.any():
        kind = np.round(F.lift[si[close]] * 100).astype(np.int64)
        first = np.full(n, -1); np.maximum.at(first, pi[close], kind)
        other = np.zeros(n, bool); np.logical_or.at(other, pi[close], kind != first[pi[close]])
        cap = np.full(n, -np.inf); np.maximum.at(cap, pi[close], at[close])
        between = other & np.isfinite(cap)
        high[between] = np.minimum(high[between], cap[between] + 0.03)
        low = np.minimum(low, high)
    # (a point a cell from the water, or under or beside a bridge's deck, is never built up: the slope
    # up to it would stand out of the water or up through the deck)
    keep_down = [w.buffer(T["dx"] * 1.5) for w in wet] + decks(tile.get("rd"), T["dx"] * 1.5)
    if keep_down:
        near = np.zeros(n, bool)
        near[shapely.STRtree(keep_down).query(pts, predicate="intersects")[0]] = True
        low[near] = -np.inf
    # (under a bridge's deck, half a metre either side and a cell beyond that, or the slope up from a
    # corner further out rises into it, the ground is kept DECK_UNDER under its underside; but not
    # within half a cell of an abutment, where the deck lands on the survey's ground)
    under_deck = np.full(n, np.inf)
    lines = deck_lines(tile.get("rd"), lambda x, y: float(on_grid(H, T, x, y)), tile.get("se"))
    abutments = [e for a, b, _, _, _, lands in lines for e, free in zip((a, b), lands) if free]
    for (ax_, ay_), (bx_, by_), za, zb, half, lands in lines:
        vx_, vy_ = bx_ - ax_, by_ - ay_
        l2 = vx_ * vx_ + vy_ * vy_
        if l2 < 1e-6:
            continue
        edge = half + T["dx"]
        sel = np.nonzero((GX.ravel() > min(ax_, bx_) - edge) & (GX.ravel() < max(ax_, bx_) + edge)
                         & (GY.ravel() > min(ay_, by_) - edge) & (GY.ravel() < max(ay_, by_) + edge))[0]
        if not len(sel):
            continue
        qx, qy = GX.ravel()[sel], GY.ravel()[sel]
        u = ((qx - ax_) * vx_ + (qy - ay_) * vy_) / l2
        d = np.abs((qx - ax_) * vy_ - (qy - ay_) * vx_) / math.sqrt(l2)
        landing = np.zeros(len(qx), bool)
        for x, y in abutments:
            landing |= np.hypot(qx - x, qy - y) < T["dx"] / 2
        on = (u >= 0) & (u <= 1) & (d <= half + T["dx"]) & ~landing
        k = sel[on]
        under_deck[k] = np.minimum(under_deck[k], za + (zb - za) * u[on] - DECK_UNDER)
    # (beside a building the ground isn't cut below its walls' foot: the house stood on air over the
    # bank cut down to a path beside it)
    feet = [(Polygon(b["r"][0], b["r"][1:]).buffer(0), b["g"] - FOOT_DEPTH) for b in tile.get("bl") or []
            if len((b.get("r") or [[]])[0]) >= 3 and isinstance(b.get("g"), (int, float))]
    # (nor under a tree, a shrub or a street item, which stand where they were put)
    houses_only = len(feet)
    feet += [(shapely.Point(q[0], q[1]), q[2] - FOOT_DEPTH) for key, k in (("tr", 0), ("sb", 0), ("rk", 0), ("fx", 1))
             for row in tile.get(key) or [] for q in [row[k:k + 3]]
             if len(q) == 3 and all(isinstance(v, (int, float)) for v in q)]
    house_foot = np.full(n, -np.inf)
    if feet:
        rings = [g.buffer(T["dx"]) for g, _ in feet]
        gi, bi = shapely.STRtree(rings).query(pts, predicate="intersects")
        if len(gi):
            foot = np.full(n, -np.inf)
            np.maximum.at(foot, gi, np.asarray([feet[k][1] for k in bi.tolist()]))
            own = bi < houses_only
            np.maximum.at(house_foot, gi[own], np.asarray([feet[k][1] for k in bi[own].tolist()]))
            near_b = np.isfinite(foot)
            high[near_b] = np.maximum(high[near_b], np.minimum(H.ravel()[near_b], foot[near_b]))
            low = np.minimum(low, high)
    # (the room under a deck comes before a house's or a bin's foot beside it: the abutment stands
    # there, and the house beside it on its own wall)
    high = np.minimum(high, under_deck)
    low = np.minimum(low, high)
    # (a bridge's recorded end is an edge the ground meets: past an abutment held at its way's height,
    # the open ground runs on from the deck's end at that height, banked away from it as beside a face,
    # built up as an abutment's bank however far the survey's ground lies below)
    banked = np.zeros(n, bool)
    # (behind a cutting's wall the ground is built up level with the wall's top however far the grid
    # had it down at the line's level, as the cutting's own side)
    if cut_walls:
        along_wall = np.asarray([sp[a] in cut_walls and sp[b] in cut_walls for a, b in F.free.tolist()], bool)
        k = along_wall[si] & (pair_d < T["dx"] * 1.5)
        banked[pi[k]] = True
        np.maximum.at(low, pi[k], at[k])
        low = np.minimum(low, high)
    for (ex, ey, ez), (ox, oy) in held_ends(tile.get("se"), tile.get("rd")):
        qx, qy = GX.ravel() - ex, GY.ravel() - ey
        d = np.hypot(qx, qy)
        k = np.nonzero((d < BATTER_MOST + T["dx"]) & (qx * ox + qy * oy >= -0.5) & ~blocked)[0]
        if not len(k):
            continue
        pin = d[k] < T["dx"] * 0.75
        low[k] = np.where(pin, ez, np.maximum(low[k], ez - d[k] / BATTER_FILL))
        high[k] = np.where(pin, ez, np.minimum(high[k], ez + d[k] / BATTER_CUT))
        low[k] = np.minimum(low[k], high[k])
        banked[k] = True
    # (behind a railway tunnel's face, over its bores, the lid is left as laid, and none of it lower
    # than the face's top, right up to the face: cut down to the bed running on into a bore, or left
    # at the line's own ground by the grid's point nearest the face, it opened a hole behind the parapet)
    if rail:
        from railway import LID_DEEP, portal_faces
        gx, gy = GX.ravel(), GY.ravel()
        for fc in portal_faces(rail.get("portals") or []):
            u = (gx - fc["x"]) * fc["ux"] + (gy - fc["y"]) * fc["uy"]
            v = -(gx - fc["x"]) * fc["uy"] + (gy - fc["y"]) * fc["ux"]
            lid = (u > 0.0) & (u < LID_DEEP) & (v > fc["v0"]) & (v < fc["v1"])
            low[lid], high[lid] = fc["z"] + fc["top"], np.inf
            banked[lid] = True
    odd, _ = overlaps(F, A, B, segs, GX, GY)
    for v, z in odd_corners(F, odd, H, T, keep=np.minimum(house_foot, under_deck)):
        high[v] = min(high[v], z)
        low[v] = min(low[v], high[v])
    H0 = H.ravel()
    # (beside a face, a bank steeper than the batter is left rather than filling in what the survey
    # shows beside it, a cutting or a railway's bed)
    low = np.where(banked, low, np.minimum(low, H0 + FILL_MOST))
    H1 = np.clip(H0, low, high)
    # (rounded to the grid's decimetres away from the face, so a point let down under a face isn't
    # rounded back up over it)
    tenths = (H1 - T["z0"]) * 10
    tenths = np.where(H1 < H0, np.floor(tenths + 1e-6), np.where(H1 > H0, np.ceil(tenths - 1e-6), np.round(tenths)))
    cap = np.floor((high - T["z0"]) * 10 + 1e-6)
    tenths = np.where(np.isfinite(cap), np.minimum(tenths, cap), tenths)
    dz = tenths.astype(np.int64) - h0
    moved = np.nonzero(dz)[0]

    # 3. the cells wholly under faces, where no ground is drawn, and of the cells a free edge crosses,
    # those whose south-west corner is under a face (so the game knows a cell the edges cross only in
    # closed loops is a face with ground or other faces inside it, not open ground)
    cells = np.zeros((ny - 1, nx - 1), bool)
    if len(F.polys):
        cx, cy = np.meshgrid(X[:-1] + T["dx"] / 2, Y[:-1] + T["dy"] / 2)
        mid = shapely.points(cx.ravel(), cy.ravel())
        ci, _ = shapely.STRtree(F.polys).query(mid, predicate="within")
        under = np.zeros(cx.size, bool); under[ci] = True
        boxes = shapely.box(GX[:-1, :-1].ravel(), GY[:-1, :-1].ravel(), GX[1:, 1:].ravel(), GY[1:, 1:].ravel())
        crossed, _ = tree.query(boxes, predicate="intersects")
        corner = np.zeros(cx.size, bool)
        corner[shapely.STRtree(F.polys).query(shapely.points(GX[:-1, :-1].ravel(), GY[:-1, :-1].ravel()), predicate="intersects")[0]] = True
        under[crossed] = corner[crossed]
        under[odd] = False
        cells = under.reshape(ny - 1, nx - 1)

    s = spots[held != 0]
    return dict(n=VERSION, c=runs(cells.ravel().astype(np.int8)),
                h=np.diff(moved, prepend=0).tolist(), hz=dz[moved].tolist(),
                s=np.diff(s, prepend=0).tolist(), sz=held[held != 0].tolist(), x=np.diff(odd, prepend=0).tolist(),
                w=wall_kind(tile.get("br")))


def read(gs, T):
    """`gs` back as the covered cells (ny-1 by nx-1), the grid's heights with the carving (metres, rows
    south to north), and the ground's height from each face's top at its retaining walls, by corner."""
    nx, ny = T["nx"], T["ny"]
    mask, at, v = np.zeros((nx - 1) * (ny - 1), bool), 0, False
    for n in gs["c"]:
        mask[at:at + n] = v
        at += n; v = not v
    h = np.asarray(T["h"], np.int64).copy()
    idx = np.cumsum(np.asarray(gs["h"], np.int64))
    h[idx] += np.asarray(gs["hz"], np.int64)
    H = h.reshape(ny, nx) / 10 + T["z0"]
    held = dict(zip(np.cumsum(np.asarray(gs["s"], np.int64)).tolist(), (np.asarray(gs["sz"], float) / 100).tolist()))
    odd = np.cumsum(np.asarray(gs.get("x") or [], np.int64))
    return mask.reshape(ny - 1, nx - 1), H, held, odd


class Land:
    """The open ground of a square with `gs` as the game draws it, for the checks: the grid with its
    carving where no face is, and in a cell a face's edge crosses, what lies outside the faces, filled
    between the cell's corners and the faces' edges at the heights the ground meets them.
    `ground(x, y)` is its height (off the faces), `meets` the ground's height at each spot on a free edge."""

    def __init__(self, tile, sink=None):
        T = tile["t"]
        self.T = T
        self.F = F = Faces(tile["sf"], tile["b"])
        self.covered, H, held, odd = read(tile["gs"], T)
        if sink is not None:
            H = H - sink
        self.H = H
        sp = F.spot
        self.meets = {s: F.top[s] + held.get(s, 0.0) for s in F.top}
        self.held = held
        self.free = set(zip(sp[F.free[:, 0]].tolist(), sp[F.free[:, 1]].tolist()))
        A, B = F.segments()
        self.ha = np.asarray([self.meets[sp[a]] for a in F.free[:, 0].tolist()])
        self.hb = np.asarray([self.meets[sp[b]] for b in F.free[:, 1].tolist()])
        self.A, self.B = A, B
        segs = shapely.linestrings(np.stack([A, B], axis=1))
        self.seg_tree = shapely.STRtree(segs)
        nx, ny = T["nx"], T["ny"]
        X, Y = T["x0"] + np.arange(nx) * T["dx"], T["y0"] + np.arange(ny) * T["dy"]
        GX, GY = np.meshgrid(X, Y)
        boxes = shapely.box(GX[:-1, :-1].ravel(), GY[:-1, :-1].ravel(), GX[1:, 1:].ravel(), GY[1:, 1:].ravel())
        crossed = np.zeros(boxes.size, bool)
        crossed[self.seg_tree.query(boxes, predicate="intersects")[0]] = True
        crossed[odd] = False
        self.mixed = crossed.reshape(ny - 1, nx - 1)
        faces = shapely.union_all(shapely.make_valid(F.polys[shapely.area(F.polys) > 1e-9])) if len(F.polys) else Polygon()
        self.faces = faces
        tris, zs = [], []
        for k in np.nonzero(crossed)[0].tolist():
            land = boxes[k].difference(faces)
            for piece in getattr(land, "geoms", [land]):
                if piece.geom_type != "Polygon" or piece.area < 1e-6:
                    continue
                for t in shapely.get_parts(shapely.constrained_delaunay_triangles(piece)):
                    c = shapely.get_coordinates(t)[:3]
                    tris.append(c)
        self.tris = np.asarray(tris, float).reshape(-1, 3, 2)
        self.tz = self._heights(self.tris.reshape(-1, 2)).reshape(-1, 3) if len(self.tris) else np.zeros((0, 3))
        self.tri_tree = shapely.STRtree(shapely.polygons(self.tris)) if len(self.tris) else None

    def _heights(self, P):
        """The fill's height at each of its corners: a grid point's, or the ground's where it meets the
        faces' edge it lies on (between that edge's ends)."""
        T = self.T
        fi, fj = (P[:, 0] - T["x0"]) / T["dx"], (P[:, 1] - T["y0"]) / T["dy"]
        ri, rj = np.round(fi), np.round(fj)
        corner = (np.abs(fi - ri) < 1e-6) & (np.abs(fj - rj) < 1e-6)
        out = on_grid(self.H, T, P[:, 0], P[:, 1])
        pts = shapely.points(P[~corner])
        qi, si = self.seg_tree.query_nearest(pts, max_distance=1e-3, all_matches=False)
        A, B = self.A[si], self.B[si]
        v = B - A
        q = P[~corner][qi]
        u = np.clip(((q - A) * v).sum(1) / np.maximum((v * v).sum(1), 1e-12), 0, 1)
        z = self.ha[si] + (self.hb[si] - self.ha[si]) * u
        rest = out[~corner]
        rest[qi] = z
        out[~corner] = rest
        return out

    def ground(self, x, y):
        """The open ground's height at each (x, y): the fill where it covers the point, else the grid."""
        x, y = np.atleast_1d(np.asarray(x, float)), np.atleast_1d(np.asarray(y, float))
        out = on_grid(self.H, self.T, x, y)
        if self.tri_tree is None:
            return out
        pi, ti = self.tri_tree.query(shapely.points(np.stack([x, y], 1)), predicate="intersects")
        if len(pi):
            t = self.tris[ti]
            a, b, c = t[:, 0], t[:, 1], t[:, 2]
            d = (b[:, 1] - c[:, 1]) * (a[:, 0] - c[:, 0]) + (c[:, 0] - b[:, 0]) * (a[:, 1] - c[:, 1])
            d = np.where(np.abs(d) < 1e-12, 1e-12, d)
            l1 = ((b[:, 1] - c[:, 1]) * (x[pi] - c[:, 0]) + (c[:, 0] - b[:, 0]) * (y[pi] - c[:, 1])) / d
            l2 = ((c[:, 1] - a[:, 1]) * (x[pi] - c[:, 0]) + (a[:, 0] - c[:, 0]) * (y[pi] - c[:, 1])) / d
            z = self.tz[ti]
            out[pi] = l1 * z[:, 0] + l2 * z[:, 1] + (1 - l1 - l2) * z[:, 2]
        return out


def main(argv):
    """python3 -I tools/partition/sheet.py <square.json> ...: write `gs` into squares already built, as
    the writer does (for trying the rules out without a rebuild; a rebuild writes the same)."""
    import json
    for f in argv:
        tile = json.load(open(f))
        tile.pop("gs", None)
        gs = ground_sheet(tile)
        if gs is not None:
            tile["gs"] = gs
        open(f, "w").write(json.dumps(tile, separators=(",", ":")))
        print(f"{f}: {'no faces' if gs is None else f'{len(gs[chr(104)])} grid points carved, {len(gs[chr(115)])} retaining corners, walls {gs[chr(119)]}'}")


if __name__ == "__main__":
    import sys
    main(sys.argv[1:])
