"""Which guessed boundaries stand.

A front wall goes where the house stands on its pavement, a lane's edge keeps only what the lidar or
a map shows along it, and a guessed garden boundary ends where the garden does.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shapely.geometry import LineString, box

from partition.settle import INFERRED_CAP, Evidence, _intervals, settle


def edge(xy, kind, source, sides):
    return dict(xy=[list(p) for p in xy], kind=kind, source=source, sides=sides, support=0.0)


class Settle(unittest.TestCase):
    def setUp(self):
        # a house 10 m deep, its front 1 m back from a street running along y = 0 (far from Bath's
        # zones, so the suburb's)
        self.house = box(5000, 1, 5010, 11)
        self.owners = {7: self.house}

    def test_a_house_on_its_pavement_has_no_front_wall(self):
        part = dict(edges=[edge([(5000, 0), (5010, 0)], "garden_wall", "front", [["corridor"], ["plot", 7]])])
        settle(part, self.owners, {7: "terrace"}, Evidence([]))
        self.assertEqual(part["edges"][0]["kind"], "none")

    def test_a_front_garden_keeps_its_wall(self):
        self.owners[7] = box(5000, 6, 5010, 16)
        part = dict(edges=[edge([(5000, 0), (5010, 0)], "garden_wall", "front", [["corridor"], ["plot", 7]])])
        settle(part, self.owners, {7: "terrace"}, Evidence([]))
        self.assertEqual(part["edges"][0]["kind"], "garden_wall")

    def test_a_real_wall_on_the_pavement_stands(self):
        part = dict(edges=[edge([(5000, 0), (5010, 0)], "garden_wall", "front", [["corridor"], ["plot", 7]])])
        settle(part, self.owners, {7: "terrace"}, Evidence([LineString([(5000, 0.3), (5010, 0.3)])]))
        self.assertEqual(part["edges"][0]["kind"], "garden_wall")

    def test_a_lane_keeps_only_what_stands_along_it_as_a_hedge(self):
        part = dict(edges=[edge([(0, 0), (100, 0)], "fence", "front", [["corridor"], ["open"]])])
        settle(part, {}, {}, Evidence([LineString([(0, 0.5), (40, 0.5)])]))
        e = part["edges"][0]
        self.assertEqual(e["kind"], "hedge")
        self.assertEqual(len(e["drop"]), 1)
        self.assertAlmostEqual(e["drop"][0][0], 41.0, delta=1.0)
        self.assertEqual(e["drop"][0][1], 100.0)

    def test_a_guessed_boundary_ends_with_the_garden(self):
        part = dict(edges=[edge([(5005, 11), (5005, 111)], "fence", "inferred", [["open"], ["plot", 7]])])
        settle(part, self.owners, {7: "detached"}, Evidence([]))
        (a, b), = part["edges"][0]["drop"]
        self.assertAlmostEqual(a, INFERRED_CAP, delta=1.0)
        self.assertEqual(b, 100.0)

    def test_an_outbuilding_has_no_guessed_boundary(self):
        part = dict(edges=[edge([(5000, 11), (5010, 11)], "fence", "inferred", [["open"], ["plot", 7]])])
        settle(part, self.owners, {7: "outbuilding"}, Evidence([]))
        self.assertEqual(part["edges"][0]["kind"], "none")

    def test_short_gaps_close_and_short_stubs_go(self):
        flags = [True] * 10 + [False] + [True] * 10 + [False] * 20 + [True] * 2 + [False] * 10
        self.assertEqual(_intervals(flags, 52.0, 52), [(20.5, 52.0)])


if __name__ == "__main__":
    unittest.main()
