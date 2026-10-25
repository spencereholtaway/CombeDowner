"""The passes' file writing and street fitting: nothing is lost or left stale on the way."""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import numpy as np
from shapely.geometry import LineString, Polygon

from partition.corridors import fit_cross_section, offset_poly
from partition.once import _poly_from, _poly_json, _poly_json_parts, clear_owned


class PavementWidthTest(unittest.TestCase):
    def test_a_pavement_that_vanishes_partway_is_written_whole(self):
        line = LineString([(0, 0), (100, 0)])
        ts = np.linspace(0, 100, 51)
        # width 3 m at both ends and nothing in the middle: two pieces after the repair
        left = np.where(np.abs(ts - 50) < 8, -1.0, 3.0)
        pl = offset_poly(line, ts, left, np.zeros(len(ts)))
        out = _poly_from(_poly_json(pl))
        self.assertAlmostEqual(out.area, pl.area, places=3)
        self.assertGreater(out.area, 0)

    def test_a_bow_tie_keeps_both_halves(self):
        bow = Polygon([(0, 0), (10, 10), (10, 0), (0, 10)])
        parts = _poly_json_parts(bow, dec=3)
        self.assertEqual(len(parts), 2)
        self.assertAlmostEqual(sum(_poly_from(p).area for p in parts), 50, places=2)


class LanesAndWidthTest(unittest.TestCase):
    def fit(self, tags):
        e = dict(cls="residential", obs=[(0, 100, tags)])
        ts = np.linspace(0, 100, 11)
        none = [None] * len(ts)
        _, sec = fit_cross_section(e, ts, none, none)
        return float(sec[5][0])

    def test_a_bad_lanes_tag_does_not_hide_a_good_width(self):
        self.assertAlmostEqual(self.fit({"lanes": "2;1", "width": "9"}), 9.0)

    def test_a_bad_width_tag_leaves_the_lanes(self):
        self.assertNotAlmostEqual(self.fit({"lanes": "2", "width": "wide"}), 9.0)


class MeasuredWidthTest(unittest.TestCase):
    def fit(self, soft, hard):
        e = dict(cls="residential", obs=[(0, 100, {"width": "7.1"})])
        ts = np.linspace(0, 100, 11)
        n = len(ts)
        stretches, _ = fit_cross_section(e, ts, [soft] * n, [soft] * n, hard=([hard] * n, [hard] * n))
        return stretches[0][2]

    def test_a_lidar_run_inside_a_tagged_street_is_passed_over(self):
        self.assertEqual(self.fit(soft=3.0, hard=None), [7.1, 2.0, 2.0])

    def test_buildings_still_narrow_a_tagged_carriageway(self):
        w, _, _ = self.fit(soft=3.0, hard=3.0)
        self.assertLess(w, 7.1)


class RerunTest(unittest.TestCase):
    def test_a_rerun_clears_what_it_owns_and_nothing_else(self):
        with tempfile.TemporaryDirectory() as d:
            for sq in ("1_1", "2_2"):
                os.makedirs(os.path.join(d, sq))
                for name in ("blocks.json", "corridors.json"):
                    json.dump([], open(os.path.join(d, sq, name), "w"))
            clear_owned(d, "blocks.json")
            self.assertFalse(os.path.exists(os.path.join(d, "1_1", "blocks.json")))
            self.assertTrue(os.path.exists(os.path.join(d, "2_2", "corridors.json")))


if __name__ == "__main__":
    unittest.main()
