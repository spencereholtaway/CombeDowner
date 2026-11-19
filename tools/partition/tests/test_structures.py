"""Bridges and road heights (`tools/structures.py`): the pure parts, on small invented streets."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shapely.geometry import LineString

import partition  # noqa: F401  (puts tools/ on the path)
from shapely.geometry import box

from structures import (chain_edges, deck_ends, drop_empty_spans, ease_bends, follow_ground, grow_marks, level_structures,
                        match_structures, solve, split_back)


def edge(i, pts, cls="residential"):
    return dict(id=i, cls=cls, line=LineString(pts), struct={})


class Structures(unittest.TestCase):
    def test_a_bridge_flag_lands_on_the_edge_it_runs_along(self):
        edges = [edge(0, [(0, 0), (100, 0)]), edge(1, [(0, 10), (100, 10)])]
        seg = LineString([(0, 0.5), (100, 0.5)])
        out = match_structures(edges, [(seg, {"class": "residential",
                                              "road_flags": [{"values": ["is_bridge"], "between": [0.4, 0.6]}]})])
        self.assertEqual(list(out), [0])
        (a, b), = out[0]["bridge"]
        self.assertAlmostEqual(a, 40, delta=1.5)
        self.assertAlmostEqual(b, 60, delta=1.5)

    def test_a_footway_bridge_does_not_mark_the_street_beside_it(self):
        edges = [edge(0, [(0, 0), (100, 0)])]
        seg = LineString([(0, 1), (100, 1)])
        out = match_structures(edges, [(seg, {"class": "footway",
                                              "road_flags": [{"values": ["is_bridge"], "between": [0.0, 1.0]}]})])
        self.assertEqual(out, {})

    def test_a_bridge_is_carried_straight_between_its_ends_without_a_shelf_before_it(self):
        run = [[i * 4.0, 0, i / 20] for i in range(21)]
        z = [i * 0.4 - (3.0 if 8 <= i <= 12 else 0.0) for i in range(21)]     # a hillside, dipping into the gap
        z = level_structures(run, z, [(0.4, 0.6)], [])
        self.assertLess(z[4], z[7])                      # the road still climbs on the way up to it
        slope = (z[13] - z[7]) / 6
        for i in range(8, 13):
            self.assertAlmostEqual(z[i], z[7] + slope * (i - 7), places=6)

    def test_two_edges_that_carry_straight_on_are_one_road_but_a_side_street_is_not(self):
        edges = [edge(0, [(0, 0), (50, 0)]), edge(1, [(50, 0), (100, 0)]), edge(2, [(50, 0), (50, 40)])]
        roads = chain_edges(edges)
        self.assertEqual(sorted(sorted(e["id"] for e, _ in c) for c in roads), [[0, 1], [2]])

    def test_a_span_that_meets_the_ground_runs_out_to_it_by_a_few_points_only(self):
        span = {5}
        grow_marks([10.0] * 12, [0.0] * 12, span, set())
        self.assertEqual(span, {2, 3, 4, 5, 6, 7, 8})

    def test_a_span_is_not_run_out_over_points_it_is_told_to_keep_clear_of(self):
        span = {5}
        grow_marks([10.0] * 12, [0.0] * 12, span, set(), forbid={4})
        self.assertEqual(span, {5, 6, 7, 8})

    def test_a_road_crossing_under_a_bridge_is_dipped_for_headroom_and_says_so(self):
        def road(points, c, z, span=()):
            n = len(points)
            return dict(parts=[(0, False, 0, n - 1)], c=c, run=[[x, y, i / (n - 1)] for i, (x, y) in enumerate(points)],
                        z=list(z), span=set(span), bored=[], tunnel_ranges=[])
        top = road([(x, 0) for x in range(-60, 61, 4)], "residential", [10.0] * 31, span=range(11, 20))
        under = road([(2, y) for y in range(-60, 61, 4)], "residential", [10.0] * 31)
        solve([top, under], [], [], None, lambda x, y: 0.0, box(-100, -100, 100, 100))
        self.assertLess(under["z"][15], 10.0 - 4.6)
        self.assertIn(15, under["dipped"])
        self.assertEqual(split_back(under)[0]["dip"][0] <= 15 <= split_back(under)[0]["dip"][-1], True)

    def test_a_road_off_a_span_stays_within_reach_of_the_ground(self):
        z = follow_ground([5.0, 5.0, 5.0], [0.0, 4.8, 9.0], {0}, set())    # (point 0 is a span; point 2 is 4 m low)
        self.assertEqual(z[:2], [5.0, 5.0])
        self.assertAlmostEqual(z[2], 8.6)

    def test_a_dip_in_the_ground_is_eased_where_the_ground_allows_it(self):
        xy = [(4.0 * i, 0.0) for i in range(7)]
        ground = [10.0, 10.0, 10.0, 9.5, 10.0, 10.0, 10.0]
        z = ease_bends(xy, [10.0, 10.0, 10.0, 9.6, 10.0, 10.0, 10.0], ground, set())
        self.assertGreater(z[3], 9.7)
        self.assertGreaterEqual(z[3], ground[3] - 0.4)

    def test_easing_never_leaves_the_ground_or_moves_a_fixed_point(self):
        xy = [(4.0 * i, 0.0) for i in range(5)]
        ground = [0.0, 0.0, 5.0, 0.0, 0.0]
        z = ease_bends(xy, [0.0, 0.0, 5.0, 0.0, 0.0], ground, {2})
        self.assertEqual(z[2], 5.0)
        z = ease_bends(xy, [0.0, 0.0, 5.0, 0.0, 0.0], ground, set())
        self.assertTrue(all(abs(a - b) <= 0.4 + 1e-9 for a, b in zip(z, ground)))
        self.assertEqual((z[0], z[-1]), (0.0, 0.0))

    def test_a_deck_comes_down_to_the_bank_but_never_rises_or_sinks(self):
        xy = [(4.0 * i, 0.0) for i in range(10)]
        ground = [10.0, 10.0, 10.0, 10.0, 10.0, 8.0, 6.0, 4.0, 2.0, 0.0]
        start = [10.0, 10.0, 10.0, 10.0, 10.0, 10.0, 6.0, 4.0, 2.0, 0.0]
        marks = {2, 3, 4, 5}
        z = ease_bends(xy, start, ground, marks, deck_ends(marks, 2))
        self.assertTrue(all(z[i] <= start[i] + 1e-9 and z[i] >= ground[i] - 0.25 - 1e-9 for i in marks))
        self.assertLess(z[5], 10.0)
        self.assertEqual(z[2], 10.0)

    def test_deck_ends_are_the_points_at_each_end_of_a_stretch(self):
        self.assertEqual(deck_ends({3, 4, 5, 6, 7, 8, 9}, 2), {3, 4, 8, 9})

    def test_a_bridge_with_nothing_under_it_is_cleared(self):
        road = dict(p=[[0, 0, 5.0], [4, 0, 5.0, 1], [8, 0, 5.0, 1], [12, 0, 5.0]])
        n = drop_empty_spans([road], lambda x, y: 5.0, [LineString([(0, 50), (1, 50), (1, 51)]).buffer(1)],
                             [LineString([(0, 30), (10, 30)])])
        self.assertEqual(n, 1)
        self.assertTrue(all(len(q) == 3 for q in road["p"]))

    def test_a_bridge_going_on_into_the_next_square_is_kept(self):
        road = dict(p=[[0, 0, 5.0], [4, 0, 5.0, 1], [8, 0, 5.0, 1], [12, 0, 5.0, 1]])
        n = drop_empty_spans([road], lambda x, y: 5.0, [LineString([(0, 50), (1, 50), (1, 51)]).buffer(1)],
                             [LineString([(0, 30), (10, 30)])], sq=(-20, -20, 12, 20))
        self.assertEqual(n, 0)
        self.assertEqual(road["p"][3][3], 1)

    def test_each_edge_gets_its_own_back_from_a_through_road(self):
        r = dict(parts=[(7, False, 0, 2), (9, True, 2, 4)], z=[1, 2, 3, 4, 5], span={3}, deck=set(), bored=[])
        out = split_back(r)
        self.assertEqual(out[7]["z"], [1, 2, 3])
        self.assertEqual(out[9]["z"], [5, 4, 3])
        self.assertEqual(out[9]["span"], [1])

    def test_a_roads_tunnel_does_not_mark_a_lane_drawn_along_it(self):
        edges = [edge(0, [(0, 0), (100, 0)], "trunk"), edge(1, [(0, 1), (100, 1)], "service")]
        seg = LineString([(0, 0), (100, 0)])
        out = match_structures(edges, [(seg, {"class": "trunk",
                                              "road_flags": [{"values": ["is_tunnel"], "between": [0.2, 0.8]}]})])
        self.assertEqual(list(out), [0])


    def test_osm_tags_mark_their_stretch_and_a_covered_way_stays_on_the_ground(self):
        from structures import osm_structures
        edges = [dict(id=0, obs=[(0, 30, {"highway": "trunk"}), (30, 100, {"highway": "trunk", "tunnel": "yes", "layer": "-1"})]),
                 dict(id=1, obs=[(0, 20, {"highway": "footway", "covered": "yes"})])]
        edges.append(dict(id=2, obs=[(0, 40, {"highway": "service", "tunnel": "covered"})]))
        edges.append(dict(id=3, obs=[(0, 40, {"highway": "pedestrian", "bridge": "yes", "_ring": True})]))
        out = osm_structures(edges, {0: {"tunnel": [[28.0, 90.0]]}})
        self.assertEqual(out, {0: {"tunnel": [[28.0, 100.0]]}})


if __name__ == "__main__":
    unittest.main()
