"""A street item that landed in the road goes back on the pavement of the nearest street."""
import math
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from partition.write_tile import reseat_on_pavement


def street(pv, w=6.0, c="residential"):
    return {"c": c, "n": "", "p": [[0, 0, 0], [100, 0, 0]], "w": w, "pv": pv}


class ReseatTest(unittest.TestCase):
    def test_a_post_box_in_the_road_goes_to_the_nearest_point_of_the_pavement_on_its_side(self):
        x, y, a = reseat_on_pavement("post", 50, 1.0, [street([1.7, 1.7])])
        self.assertAlmostEqual(x, 50)
        self.assertAlmostEqual(y, 3.0 + 0.45)
        self.assertAlmostEqual(a, 0)

    def test_a_bus_stop_keeps_room_for_its_shelter(self):
        x, y, a = reseat_on_pavement("bus", 50, 1.0, [street([1.7, 1.7])])
        self.assertAlmostEqual(y, 3.0 + 0.9)

    def test_the_other_side_faces_back_along_the_street(self):
        x, y, a = reseat_on_pavement("lamp", 50, -1.0, [street([1.7, 1.7])])
        self.assertAlmostEqual(y, -(3.0 + 0.45))
        self.assertAlmostEqual(abs(a), math.pi)

    def test_a_side_with_no_pavement_takes_nothing(self):
        self.assertIsNone(reseat_on_pavement("bin", 50, -1.0, [street([1.7, 0.0])]))

    def test_a_street_out_of_reach_takes_nothing(self):
        self.assertIsNone(reseat_on_pavement("bin", 50, 30.0, [street([1.7, 1.7])]))

    def test_a_footway_is_not_a_street_to_stand_beside(self):
        self.assertIsNone(reseat_on_pavement("bin", 50, 1.0, [street([1.7, 1.7], c="footway")]))


if __name__ == "__main__":
    unittest.main()
