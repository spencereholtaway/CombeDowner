"""A pedestrian street keeps its benches, is paved to its buildings, and a path lying wholly on a
street is that street."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shapely.geometry import Point, Polygon

from partition.write_tile import drawn_carriageway, drop_clashes, drop_paths_along_streets, street_surfaces


def face(cls, x0, y0, x1, y1):
    return dict(cls=cls, xy=[[x0, y0], [x1, y0], [x1, y1], [x0, y1]])


def street(c, w=4.0, pv=None, y=0.0):
    r = dict(c=c, n="", w=w, p=[[0.0, y, 10.0], [60.0, y, 10.0]])
    if pv:
        r["pv"] = pv
    return r


SQ = (-100, -100, 100, 100)
GROUND = lambda x, y: 10.0      # noqa: E731


def paved_area(sf):
    v = sf["v"]
    return sum(Polygon([(v[3 * i], v[3 * i + 1]) for i in ids[k:k + 3]]).area
               for kind in ("road", "service", "pave", "drive") for ids in [sf[kind]] for k in range(0, len(ids), 3))


class PedestrianStreetTest(unittest.TestCase):
    def test_a_bench_on_a_pedestrian_street_stays(self):
        part = dict(faces=[face("carriageway", 0, -2, 60, 2)])
        rd = [street("pedestrian")]
        sf = street_surfaces(part, rd, SQ, GROUND)
        tile = dict(tr=[], sb=[], bl=[], fx=[["bench", 30.0, 0.5, 10.0, 0.0]])
        drop_clashes(tile, part, [], rd=rd, ground=GROUND, carriageway=drawn_carriageway(sf))
        self.assertEqual(len(tile["fx"]), 1)

    def test_a_bench_in_a_road_still_goes(self):
        part = dict(faces=[face("carriageway", 0, -3, 60, 3)])
        rd = [street("residential", w=6.0, pv=[0.0, 0.0])]
        sf = street_surfaces(part, rd, SQ, GROUND)
        tile = dict(tr=[], sb=[], bl=[], fx=[["bench", 30.0, 0.5, 10.0, 0.0]])
        drop_clashes(tile, part, [], rd=rd, ground=GROUND, carriageway=drawn_carriageway(sf))
        self.assertEqual(tile["fx"], [])

    def test_a_pedestrian_street_is_paved_to_its_buildings(self):
        part = dict(faces=[face("carriageway", 0, -2, 60, 2), face("open", 0, 2, 60, 6), face("building", 0, 6, 60, 12),
                           face("plot", 0, -6, 60, -2), face("building", 0, -12, 60, -6)])
        sf = street_surfaces(part, [street("pedestrian")], SQ, GROUND)
        self.assertAlmostEqual(paved_area(sf), 60 * 12, delta=5)

    def test_a_walled_yard_beside_a_pedestrian_street_is_left(self):
        part = dict(faces=[face("carriageway", 0, -2, 60, 2), face("plot", 0, 2, 60, 6)])
        wall = [dict(c="garden_wall", p=[[0.0, 2.0, 10.0], [60.0, 2.0, 10.0]])]
        sf = street_surfaces(part, [street("pedestrian")], SQ, GROUND, br=wall)
        self.assertAlmostEqual(paved_area(sf), 60 * 4, delta=5)

    def test_open_ground_behind_a_pedestrian_street_is_paved_only_to_its_width(self):
        part = dict(faces=[face("carriageway", 0, -2, 60, 2), face("open", 0, 2, 60, 40)])
        sf = street_surfaces(part, [street("pedestrian")], SQ, GROUND)
        self.assertAlmostEqual(paved_area(sf), 60 * 8, delta=5)

    def test_a_path_lying_wholly_on_a_street_is_the_street(self):
        crossing = dict(c="footway", n="", w=1.8, p=[[30.0, -6.0, 10.0], [30.0, 6.0, 10.0]])
        away = dict(c="footway", n="", w=1.8, p=[[30.0, 6.0, 10.0], [30.0, 40.0, 10.0]])
        rd, _ = drop_paths_along_streets([street("residential", w=6.0, pv=[2.0, 2.0]), crossing, away])
        self.assertEqual([r["c"] for r in rd], ["residential", "footway"])
        self.assertTrue(any(Point(30, 30).distance(Point(q[:2])) < 11 for q in rd[1]["p"]))


if __name__ == "__main__":
    unittest.main()


class PedestrianFrontsTest(unittest.TestCase):
    """Nothing guessed or listed stands between a pedestrian street and its shopfronts."""

    def test_a_listed_railing_on_a_pedestrian_street_goes(self):
        from shapely.geometry import box
        from partition.settle import Evidence, settle
        part = dict(edges=[dict(xy=[[5000, 0], [5010, 0]], kind="garden_wall", source="front",
                                sides=[["corridor"], ["plot", 7]], support=0.0)])
        listed = [(Point(5005, 2), "railing")]
        settle(part, {7: box(5000, 1, 5010, 11)}, {7: "terrace"}, Evidence([], (), listed),
               pedestrian=box(4990, -5, 5020, 1))
        e = part["edges"][0]
        self.assertEqual(e.get("drop"), [(0.0, 10.0)])

    def test_a_mapped_wall_on_a_pedestrian_street_stands(self):
        from shapely.geometry import LineString, box
        from partition.settle import Evidence, settle
        wall = LineString([(5000, 0.3), (5010, 0.3)])
        part = dict(edges=[dict(xy=[[5000, 0], [5010, 0]], kind="garden_wall", source="front",
                                sides=[["corridor"], ["plot", 7]], support=0.0)])
        settle(part, {7: box(5000, 1, 5010, 11)}, {7: "terrace"}, Evidence([wall], [(wall, "wall")]),
               pedestrian=box(4990, -5, 5020, 1))
        self.assertFalse(part["edges"][0].get("drop"))

    def test_paving_on_the_ground_has_a_corner_at_every_grid_point(self):
        from partition.write_tile import _ground_triangles
        T = dict(x0=0.0, y0=0.0, dx=4.0, dy=4.0)
        tris = _ground_triangles(Polygon([(1, 1), (15, 1), (15, 11), (1, 11)]), T)
        corners = {(round(x, 6), round(y, 6)) for t in tris for x, y in t.exterior.coords}
        for gx in (4.0, 8.0, 12.0):
            for gy in (4.0, 8.0):
                self.assertIn((gx, gy), corners)
        self.assertAlmostEqual(sum(t.area for t in tris), 140.0, places=6)


class ListedOpenFrontTest(unittest.TestCase):
    def test_listed_railings_stand_on_a_street_edge_in_front_of_open_ground(self):
        from shapely.geometry import box
        from partition.settle import Evidence, settle
        part = dict(edges=[dict(xy=[[5000, 0], [5040, 0]], kind="none", source="parcel-nothing",
                                sides=[["corridor"], ["open"]], support=0.0)])
        settle(part, {7: box(5015, 10, 5025, 20)}, {7: "detached"},
               Evidence([], (), [(Point(5020, 4), "railing")]))
        e = part["edges"][0]
        self.assertEqual(e["kind"], "railing")
        kept = 40.0 - sum(b - a for a, b in e["drop"])
        self.assertTrue(10.0 <= kept <= 16.0, kept)


class TunnelPathTest(unittest.TestCase):
    def test_no_path_is_drawn_over_a_canal_tunnel(self):
        from shapely.geometry import box
        part = dict(faces=[face("path", 0, -1, 40, 1)], edges=[], openings=[])
        rd = [dict(c="footway", n="", w=2.0, p=[[0.0, 0.0, 10.0], [40.0, 0.0, 10.0]])]
        sf = street_surfaces(part, rd, SQ, GROUND, bores=box(10, -5, 30, 5))
        v, ids = sf["v"], sf["path"]
        area = sum(Polygon([(v[3 * i], v[3 * i + 1]) for i in ids[k:k + 3]]).area for k in range(0, len(ids), 3))
        self.assertAlmostEqual(area, 40.0, delta=0.5)
