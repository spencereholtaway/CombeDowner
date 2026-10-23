"""Real building heights and roof shapes from Environment Agency lidar (1 m, British National Grid).

Data: the EA's 1 m LIDAR Composite DTM (bare ground), First Return DSM (ground plus buildings
and trees) and Last Return DSM (the same, but through the leaves where the pulse got there), open
data under the Open Government Licence. Put the GeoTIFFs for the map in <raw dir>/lidar/dtm/,
<raw dir>/lidar/dsm/ and <raw dir>/lidar/last/ (see README). Any number of tiles in each.

For each building footprint the roof is sampled every half metre, a little inside the walls:
- eaves and ridge are low and high percentiles of the roof surface (roofs are level even when the
  ground slopes, so absolute heights are used), measured from the lowest ground at the walls,
  and mid is the median, for buildings drawn as a flat-topped block;
- a roof is flat when the ridge is less than a metre above the eaves;
- the ridge runs along whichever axis of the footprint the roof height does not fall away along,
  and a roof is hipped when it also falls away towards both ends of the ridge.
Footprints with no raised surface under them (the building is newer than the survey, or gone),
roofs mostly under trees (where the canopy map has trees and the survey agrees: the first and
last returns differ, or the surface is as lumpy as a tree crown), and small buildings measuring
implausibly tall get no measurement, and keep the rule-based guess from buildings.py.
"""
import glob, math, os
import numpy as np
import shapely

PX = 0.5            # sample spacing inside a footprint, metres
INSET = 0.4         # keep samples this far inside the walls, clear of gutters and overhangs
MIN_ABOVE = 1.8     # median height above ground below which there is no building in the survey
MAX_RISE = 5.0      # tallest roof, eaves to ridge
TREE_COVER = 0.3    # share of a roof under tree canopy beyond which the survey can't see it
ROUGH = 1.0         # metres: how lumpy a survey can be (see rough) and still be a roof; tree crowns are lumpier
TOWER = 30.0        # metres: a smooth roof this high is a tower, even where the canopy map takes it for a tree
THROUGH = 1.0       # metres between the first and last returns at a point that means leaves over what's below
LUMPY = 0.7         # metres: lumpier than 19 in 20 roofs clear of trees: under the canopy map's trees, a tree


_BNG = None

def bng_transformer():
    """Degrees to British National Grid, through the OS's OSTN15 grid. Without that grid PROJ falls
    back to an approximation a few tens of centimetres out (mostly northwards), and it does so
    silently, so the grid is fetched from the PROJ CDN on first use, and a build that still can't
    get it stops rather than measure in the wrong place."""
    global _BNG
    if _BNG is None:
        import pyproj
        from pyproj import Transformer
        pyproj.network.set_network_enabled(True)
        t = Transformer.from_crs("EPSG:4326", "EPSG:27700", always_xy=True)
        e, n = t.transform(-2.36, 51.38)
        if abs(e - 375041.627) > 0.01 or abs(n - 164611.888) > 0.01:
            raise SystemExit(
                f"PROJ has no OSTN15 grid (got {e:.3f}, {n:.3f}, not 375041.627, 164611.888) and couldn't "
                "fetch it from cdn.proj.org. Connect to the internet and run again, or download "
                "uk_os_OSTN15_NTv2_OSGBtoETRS.tif from https://cdn.proj.org into "
                f"{pyproj.datadir.get_user_data_dir()}")
        _BNG = t
    return _BNG


def _to_bng(lonlat):
    """Degrees to British National Grid metres."""
    e, n = bng_transformer().transform(lonlat[0], lonlat[1])
    return np.asarray(e), np.asarray(n)


class Lidar:
    def __init__(self, folder, to_model):
        import rasterio
        self.lon0, self.lat0, self.kx, self.ky = to_model
        self.grids = {}
        for kind in ("dtm", "dsm", "last"):
            files = sorted(glob.glob(os.path.join(folder, kind, "*.tif")) + glob.glob(os.path.join(folder, kind, "*.asc")))
            if not files:
                if kind == "last": continue      # the last returns are optional: without them the canopy map says where trees are
                raise FileNotFoundError(f"no {kind} tiles in {os.path.join(folder, kind)}")
            self.grids[kind] = []
            for f in files:
                # only where each tile is and its size for now: its heights are read the first time
                # something on it is asked for (a square of Bath usually needs one or two of them)
                with rasterio.open(f) as src:
                    self.grids[kind].append([f, src.transform, src.shape, None])

    def preload(self, bbox):
        """Read now the tiles under a box (W, S, E, N in degrees), before the work is shared out
        between processes, so each doesn't read them again."""
        lon, lat = np.array([bbox[0], bbox[2], bbox[0], bbox[2]]), np.array([bbox[1], bbox[1], bbox[3], bbox[3]])
        e, n = self._bng((lon - self.lon0) * self.kx, (lat - self.lat0) * self.ky)
        for grids in self.grids.values():
            for g in grids:
                t, (h, w) = g[1], g[2]
                if e.max() >= t.c and e.min() <= t.c + w * t.a and n.max() >= t.f + h * t.e and n.min() <= t.f: self._heights(g)

    def _heights(self, g):
        if g[3] is None:
            import rasterio
            with rasterio.open(g[0]) as src:
                a = src.read(1).astype(np.float32)
            a[(a < -100) | (a > 2000)] = np.nan      # nodata (the EA tiles use -3.4e38)
            g[3] = a
        return g[3]

    workers = 1         # processes to share a big conversion between (set by prep_map.py for the detailed map)

    def _bng(self, xs, ys):
        lon = np.asarray(xs) / self.kx + self.lon0
        lat = np.asarray(ys) / self.ky + self.lat0
        if self.workers < 2 or len(lon) < 1_000_000: return _to_bng((lon, lat))
        # millions of points (the tree canopy grid): each point is converted on its own, so the
        # work can be shared out in pieces and put back together in order
        import multiprocessing
        pieces = [(a, b) for a, b in zip(np.array_split(lon, self.workers), np.array_split(lat, self.workers))]
        with multiprocessing.get_context("fork").Pool(self.workers) as pool:
            done = pool.map(_to_bng, pieces)
        return np.concatenate([d[0] for d in done]), np.concatenate([d[1] for d in done])

    def _sample(self, kind, e, n):
        out = np.full(len(e), np.nan, dtype=np.float32)
        for g in self.grids[kind]:
            t, shape = g[1], g[2]
            col = np.floor((e - t.c) / t.a).astype(int)
            row = np.floor((n - t.f) / t.e).astype(int)
            ok = (row >= 0) & (row < shape[0]) & (col >= 0) & (col < shape[1])
            if ok.any(): out[ok] = self._heights(g)[row[ok], col[ok]]
        return out

    def surface(self, xs, ys):
        """Surveyed surface height (metres above sea level) at model points: roofs, over buildings."""
        e, n = self._bng(xs, ys)
        return self._sample("dsm", e, n)

    def ground(self, xs, ys):
        """Bare ground height (metres above sea level) at model points, under buildings too."""
        e, n = self._bng(xs, ys)
        return self._sample("dtm", e, n)

    def surface_and_ground(self, xs, ys):
        """Both of the above at once, for many points (the grid conversion is the slow part)."""
        e, n = self._bng(xs, ys)
        return self._sample("dsm", e, n), self._sample("dtm", e, n)

    def measure(self, poly, trees=None):
        """Eaves and ridge (metres above the lowest ground at the walls), and the roof's shape,
        for one footprint in model metres; None if the survey shows no building there, or the
        roof can't be told apart from trees over it. trees(x, y), if given, is the tree canopy
        height at a point. The survey is read once (survey), and what it says is decided on
        separately (decide), so the measurements kept in the repository (tools/mapdata.py) can
        hold what was surveyed, and a change to how it's judged needs no fresh survey."""
        return decide(poly, self.survey(poly, trees))

    def survey(self, poly, trees=None):
        """What the survey shows of one footprint's roof, as plain numbers for decide(): None if
        it has nothing there at all. tree: the share of the roof under canopy over 3 m; leaves,
        with the last returns, the share of the raised surface where they differ from the first
        returns by more than THROUGH (leaves the pulse got through); above:
        the median height of the surface over the bare ground; then, if that is building height,
        of the roof points (n of them): base, the lowest ground at the walls, and the 12th, 50th
        and 95th percentile roof heights, all above sea level; u, the ridge's direction along an
        axis of the footprint, and fall, how much the roof falls away towards the ends of that
        ridge; and fit, the roof planes fitted to it (fit_roof). rough: how lumpy the surface over
        the footprint is (rough), as tree crowns are."""
        inner = poly.buffer(-INSET)
        if inner.is_empty or inner.area < 4: return None
        x0, y0, x1, y1 = inner.bounds
        gx, gy = np.meshgrid(np.arange(x0 + PX / 2, x1, PX), np.arange(y0 + PX / 2, y1, PX))
        shape = gx.shape
        gx, gy = gx.ravel(), gy.ravel()
        keep = shapely.contains_xy(inner, gx, gy)
        gx, gy = gx[keep], gy[keep]
        if len(gx) < 12: return None
        tree = float(np.mean([trees(x, y) > 3 for x, y in zip(gx, gy)])) if trees is not None else 0.0
        ring = np.array(poly.exterior.coords)
        e, n = self._bng(np.concatenate([gx, ring[:, 0]]), np.concatenate([gy, ring[:, 1]]))
        dsm = self._sample("dsm", e[:len(gx)], n[:len(gx)])
        dtm = self._sample("dtm", e[:len(gx)], n[:len(gx)])
        wall_ground = self._sample("dtm", e[len(gx):], n[len(gx):])
        ok = ~np.isnan(dsm) & ~np.isnan(dtm)
        if ok.sum() < 12 or np.all(np.isnan(wall_ground)): return None
        above = dsm - dtm
        out = dict(tree=tree, above=float(np.median(above[ok])), rough=rough(dsm, keep, shape))
        if "last" in self.grids:
            # where the laser's first and last returns differ, part of each pulse went on through
            # leaves to something below: a tree over the roof. A flat roof stops it all, so there
            # they agree (decide says how far this is believed)
            last = self._sample("last", e[:len(gx)], n[:len(gx)])
            up = ok & ~np.isnan(last) & (above >= MIN_ABOVE)
            if up.sum() >= 12: out["leaves"] = float(np.mean(dsm[up] - last[up] > THROUGH))
        if np.median(above[ok]) < MIN_ABOVE: return out
        # keep only the roof: footprints and the survey don't line up exactly, so the edges of a
        # footprint often catch the garden or the pavement
        ok &= above >= max(MIN_ABOVE, 0.4 * float(np.percentile(above[ok], 95)))
        out["n"] = int(ok.sum())
        if ok.sum() < 12: return out
        gx, gy, z = gx[ok], gy[ok], dsm[ok]
        out.update(base=float(np.nanmin(wall_ground)), p12=float(np.percentile(z, 12)), p50=float(np.percentile(z, 50)),
                   p95=float(np.percentile(z, 95)))

        # the footprint's axes: u along the longer side of its bounding rectangle, v across it
        q = list(poly.minimum_rotated_rectangle.exterior.coords)[:4]
        e0, e1 = math.dist(q[0], q[1]), math.dist(q[1], q[2])
        (ax, ay), (bx, by) = (q[0], q[1]) if e0 >= e1 else (q[1], q[2])
        l = math.hypot(bx - ax, by - ay) or 1
        ux, uy = (bx - ax) / l, (by - ay) / l
        cx, cy = poly.minimum_rotated_rectangle.centroid.coords[0]
        s = np.abs((gx - cx) * ux + (gy - cy) * uy)       # distance from the middle, along u
        t = np.abs((gx - cx) * -uy + (gy - cy) * ux)      # and across

        def corr(a, b):
            if a.std() < 1e-3 or b.std() < 1e-3: return 0.0
            return float(np.corrcoef(a, b)[0, 1])

        cs, ct = corr(z, s), corr(z, t)
        # the highest tenth of the roof is the ridge: if it forms a line, that is the ridge's direction
        top = z >= np.percentile(z, 90)
        along_u = ct <= cs              # otherwise: a ridge along u means the roof falls away across it
        if top.sum() >= 4:
            w, vec = np.linalg.eigh(np.cov(np.vstack([gx[top], gy[top]])))
            if w[1] > 2.5 * max(w[0], 1e-6):
                along_u = abs(vec[0, 1] * ux + vec[1, 1] * uy) >= math.sqrt(0.5)
        ridge_dir, end_fall = ((ux, uy), cs) if along_u else ((-uy, ux), ct)
        out.update(u=ridge_dir, fall=end_fall, fit=fit_roof(poly, gx, gy, z, ux, uy))
        return out


def decide(poly, got):
    """measure() from what survey() found."""
    if got is None: return None
    # the canopy map takes some buildings for trees (the Abbey's tower, tall stone blocks in town),
    # so where it has trees over a roof the survey has the last word: a tree there lets some of
    # each pulse through its leaves (see survey), or leaves the surface lumpier than roofs are.
    # (The last returns alone can't say: steep roofs, spires and parapets split them too.)
    if "leaves" in got:
        if got["tree"] > TREE_COVER and (got["leaves"] > TREE_COVER or got["rough"] > LUMPY): return None
    # without the last returns: a roof standing higher than the trees here and as smooth as a
    # roof is believed over the canopy map
    elif got["tree"] > TREE_COVER and not (got["above"] >= TOWER and got["rough"] <= ROUGH): return None
    if np.float32(got["above"]) < MIN_ABOVE or got["n"] < 12: return None
    base = got["base"]
    eaves, ridge = got["p12"] - base, got["p95"] - base
    # low back extensions and porches inside the footprint drag the eaves down: no roof here
    # rises more than MAX_RISE above its eaves
    eaves = max(eaves, ridge - MAX_RISE)
    mid = got["p50"] - base
    if eaves > 4 + poly.area / 10 and got["rough"] > ROUGH:
        return None     # far too tall for its size and lumpy all over: a tree over it, not a roof
    flat = ridge - eaves < 1.0
    # and it is hipped if the roof also falls away towards both ends of the ridge
    hipped = not flat and got["fall"] < -0.25
    out = dict(eaves=eaves, ridge=ridge, mid=mid, flat=flat, u=got["u"], hipped=hipped)
    fit = choose_roof(got["fit"])
    if fit is not None:
        # the fitted roof planes, where they explain the survey well: the ridge's direction,
        # which ends are hipped, and the pitch
        out.update(u=fit["u"], hips=fit["hips"], hipped=any(fit["hips"]), flat=fit["flat"])
        if not fit["flat"]:
            out["ridge"] = eaves + fit["rise"]
    return out


def rough(z, keep, shape):
    """How lumpy the surface over a footprint is: the median of how far each sample sits off the
    straight line through its neighbours either side, across and along. Roof slopes, even steep
    ones, are straight and give almost nothing; a tree crown is all bumps. z is the surface at the
    grid points that keep marks in a grid of that shape."""
    g = np.full(shape[0] * shape[1], np.nan)
    g[keep] = z
    g = g.reshape(shape)
    d = np.concatenate([np.abs(g[:, :-2] - 2 * g[:, 1:-1] + g[:, 2:]).ravel(), np.abs(g[:-2] - 2 * g[1:-1] + g[2:]).ravel()])
    d = d[~np.isnan(d)]
    return float(np.median(d)) if len(d) else 0.0


FIT_RMS = 0.6       # metres: a fitted roof that misses the survey by more than this isn't used
SIMPLER = 0.08      # a more complicated roof must fit this much better (share of the error) to win


def fit_roof(poly, gx, gy, z, ux, uy):
    """Fit the roofs the game can draw to the surveyed roof points (gx, gy, z): flat, or pitched
    with its ridge along either axis of the footprint (u, or v across it) and each end of the
    ridge gabled or hipped, every slope at the same pitch. Each candidate is z = eaves + k * f,
    with f the height-giving distance (to the nearest eaves line), solved by least squares twice,
    the second time without the points the first missed by most (chimneys, dormers, an overhanging
    branch). Returns how well each fits, for choose_roof(), or None with too few points to try."""
    if len(z) < 30: return None
    cx, cy = poly.minimum_rotated_rectangle.centroid.coords[0]
    pts = np.array(poly.exterior.coords)
    best = []
    for ax, ay in ((ux, uy), (-uy, ux)):
        bx, by = -ay, ax
        S, T = (gx - cx) * ax + (gy - cy) * ay, (gx - cx) * bx + (gy - cy) * by
        ps, pt = (pts[:, 0] - cx) * ax + (pts[:, 1] - cy) * ay, (pts[:, 0] - cx) * bx + (pts[:, 1] - cy) * by
        s0, s1, t0, t1 = ps.min(), ps.max(), pt.min(), pt.max()
        tm, half = (t0 + t1) / 2, (t1 - t0) / 2
        across = half - np.abs(T - tm)
        for h0 in (False, True):
            for h1 in (False, True):
                if (h0 or h1) and (s1 - s0) < 2 * half * 0.6: continue    # too short to hip that way
                f = across.copy()
                if h0: f = np.minimum(f, S - s0)
                if h1: f = np.minimum(f, s1 - S)
                f = np.clip(f, 0, None)
                best.append((1 + h0 + h1, (ax, ay), (h0, h1), half, f))
    def solve(f):
        A = np.vstack([np.ones_like(f), f]).T
        keep = np.ones(len(z), bool)
        for _ in range(2):
            (e, k), *_ = np.linalg.lstsq(A[keep], z[keep], rcond=None)
            r = np.abs(z - (e + k * f))
            keep = r <= max(0.3, np.percentile(r, 85))
        return e, k, float(np.sqrt(np.mean(r[keep] ** 2)))
    flat_rms = float(np.sqrt(np.mean((z - np.median(z)) ** 2)))
    fits = []
    for parts, u, hips, half, f in best:
        e, k, rms = solve(f)
        fits.append((rms, parts, u, hips, float(k * half), float(k)))
    return dict(u=(ux, uy), flat=flat_rms, fits=fits)


def choose_roof(tried):
    """The best of the roofs fit_roof tried, preferring simpler roofs that fit nearly as well, or
    None if none fits."""
    if tried is None: return None
    (ux, uy), flat_rms = tried["u"], tried["flat"]
    fits = [f[:5] for f in tried["fits"] if f[5] > 0.1]      # no slope: flat is simpler
    if not fits: return dict(u=(ux, uy), hips=(False, False), flat=True, rise=0.0) if flat_rms < FIT_RMS else None
    low = min(f[0] for f in fits)
    if flat_rms <= low * (1 + 2 * SIMPLER) + 0.05:
        return dict(u=(ux, uy), hips=(False, False), flat=True, rise=0.0) if flat_rms < FIT_RMS else None
    rms, _, u, hips, rise = min((f for f in fits if f[0] <= low * (1 + SIMPLER) + 0.02), key=lambda f: (f[1], f[0]))
    if rms > FIT_RMS or rise < 0.8: return None
    return dict(u=u, hips=hips, flat=False, rise=float(min(rise, MAX_RISE + 1)))
