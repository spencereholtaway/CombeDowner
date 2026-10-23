"""Plot-dividing rules that must not depend on float noise or on the window a block was cut from."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import numpy as np
from shapely.geometry import LineString, Point, Polygon, box

from partition import plots
from partition.plots import Parcels, _drop_dangling, house_divisions, join_evidence


def line_of(*pts):
    return LineString(pts)


class JoinEvidenceTest(unittest.TestCase):
    def test_a_collinear_run_ahead_is_joined(self):
        out = join_evidence([line_of((100, 0), (110, 0)), line_of((112, 0), (120, 0))])
        self.assertEqual(len(out), 1)
        self.assertAlmostEqual(out[0].length, 20)

    def test_a_collinear_run_behind_is_joined(self):
        out = join_evidence([line_of((100, 0), (110, 0)), line_of((90, 0), (98, 0))])
        self.assertEqual(len(out), 1)
        self.assertAlmostEqual(out[0].length, 20)

    def test_a_perpendicular_run_is_not_joined(self):
        out = join_evidence([line_of((100, 0), (110, 0)), line_of((112, 0), (112, 10))])
        self.assertEqual(len(out), 2)


class DanglingTest(unittest.TestCase):
    B = box(0, 0, 100, 100)

    def edge(self, *pts, keep=True):
        return (line_of(*pts), "fence", 1.0, "parcel", 1.0, keep, ("plot", "plot"))

    def test_a_t_junction_is_left_alone(self):
        bar = self.edge((0, 50), (100, 50))
        stem = self.edge((50, 50), (50, 0))
        out = _drop_dangling([bar, stem, self.edge((30, 80), (60, 85))], None, self.B)
        self.assertEqual([e[1] for e in out], ["fence", "fence", "none"])

    def test_a_piece_held_at_both_ends_is_kept(self):
        a = self.edge((0, 50), (50, 50))
        b = self.edge((50, 50), (100, 50))
        out = _drop_dangling([a, b], None, self.B)
        self.assertEqual([e[1] for e in out], ["fence", "fence"])

    def test_a_neighbour_with_an_end_a_whisker_away_is_not_dropped(self):
        held = self.edge((0, 50), (50, 50))
        held2 = self.edge((50, 50), (100, 50))
        lone = self.edge((50, 52), (50, 90))
        out = _drop_dangling([held, held2, lone], None, self.B)
        self.assertEqual([e[1] for e in out][:2], ["fence", "fence"])


class NearerHouseTest(unittest.TestCase):
    def run_pair(self, small_first):
        small = box(10, 45, 14, 49)
        big = box(20, 40, 26, 54)
        block = box(0, 0, 100, 100)
        geoms = [small, big] if small_first else [big, small]
        f_small = np.array([0.0, 1.0])
        f_big = np.array([0.6, 0.8])
        fbt = {0: f_small, 1: f_big} if small_first else {0: f_big, 1: f_small}
        return house_divisions(block, geoms, fbt, {})

    def direction(self, lines):
        part = lines[0] if lines[0].geom_type == "LineString" else max(lines[0].geoms, key=lambda g: g.length)
        d = np.array(part.coords[-1]) - np.array(part.coords[0])
        d = d / np.hypot(*d)
        return d if d[1] > 0 else -d

    def test_the_wall_nearer_the_gap_sets_the_direction_whatever_the_order(self):
        for small_first in (True, False):
            lines = [l for l in self.run_pair(small_first) if l.length > 1]
            gap_lines = [l for l in lines if 14 < l.centroid.x < 30]
            self.assertTrue(gap_lines)
            d = self.direction(gap_lines)
            self.assertAlmostEqual(d[0], 0.6, places=1, msg=f"small_first={small_first}")


class ParcelIndexTest(unittest.TestCase):
    def test_the_smallest_containing_parcel_wins_in_any_order(self):
        big, small = box(0, 0, 100, 100), box(40, 40, 60, 60)
        house = box(48, 48, 52, 52)
        for polys in ([big, small], [small, big]):
            par = Parcels(polys)
            self.assertEqual(par.polys[par.index_of(house)].area, 400)


if __name__ == "__main__":
    unittest.main()
