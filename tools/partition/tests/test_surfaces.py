"""The streets' faces: a carriageway and its pavement share their edge, every point takes its street's
height, a bridge's deck is left to its strip, and paths and drives lie on the ground beside them
without overlapping them."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from partition.write_tile import street_surfaces


def face(cls, x0, y0, x1, y1):
    return dict(cls=cls, xy=[[x0, y0], [x1, y0], [x1, y1], [x0, y1]])


def road(y, z, bridge=False, c="residential"):
    return dict(c=c, n="", w=6.0, pv=[2.0, 2.0],
                p=[[0.0, y, z] + ([1] if bridge else []), [40.0, y, z] + ([1] if bridge else [])])


SQ = (-100, -100, 100, 100)


class SurfaceTest(unittest.TestCase):
    def test_a_street_and_its_pavement_meet_edge_to_edge(self):
        part = dict(faces=[face("carriageway", 0, -3, 40, 3), face("pavement", 0, 3, 40, 5)])
        sf = street_surfaces(part, [road(0, 10.0)], SQ, lambda x, y: 10.0)
        self.assertTrue(sf["road"] and sf["pave"])
        pts = {(sf["v"][3 * i], sf["v"][3 * i + 1]) for i in sf["road"]} & \
              {(sf["v"][3 * i], sf["v"][3 * i + 1]) for i in sf["pave"]}
        self.assertGreaterEqual(len(pts), 2)

    def test_each_point_is_at_its_streets_middle(self):
        part = dict(faces=[face("carriageway", 0, -3, 40, 3)])
        sf = street_surfaces(part, [road(0, 10.0)], SQ, lambda x, y: 10.0 + y)
        self.assertTrue(all(abs(z - 10.0) < 1e-6 for z in sf["v"][2::3]))

    def test_a_bridge_keeps_its_strip(self):
        part = dict(faces=[face("carriageway", 0, -3, 40, 3)])
        self.assertIsNone(street_surfaces(part, [road(0, 10.0, bridge=True)], SQ, lambda x, y: 10.0))

    def test_a_drive_meets_the_pavement_and_lies_on_the_ground(self):
        from shapely.geometry import Polygon
        part = dict(faces=[face("carriageway", 0, -3, 40, 3), face("pavement", 0, 3, 40, 5)])
        sf = street_surfaces(part, [road(0, 10.0)], SQ, lambda x, y: 10.0 + y, dv=[[20.0, 0.0, 20.0, 12.0]])
        self.assertTrue(sf["drive"])
        v = sf["v"]
        tri = lambda ids: [Polygon([(v[3 * i], v[3 * i + 1]) for i in ids[k:k + 3]]) for k in range(0, len(ids), 3)]
        drive, street = tri(sf["drive"]), tri(sf["road"]) + tri(sf["pave"])
        self.assertAlmostEqual(sum(t.area for t in drive), 3.0 * 7.0, delta=0.5)
        self.assertLess(sum(d.intersection(s).area for d in drive for s in street), 0.01)
        self.assertTrue(all(abs(v[3 * i + 2] - 10.0 - v[3 * i + 1]) < 0.02 for i in sf["drive"]))

    def test_a_pedestrianised_street_is_paved_flush(self):
        part = dict(faces=[face("carriageway", 0, -3, 40, 3)])
        sf = street_surfaces(part, [road(0, 10.0, c="pedestrian")], SQ, lambda x, y: 10.0 + y)
        self.assertTrue(sf["drive"])
        self.assertFalse(sf["road"] or sf["service"] or sf["pave"])
        v = sf["v"]
        self.assertTrue(all(abs(v[3 * i + 2] - 10.0 - v[3 * i + 1]) < 0.02 for i in sf["drive"]))

    def test_paving_beyond_a_streets_pavement_is_flush(self):
        part = dict(faces=[face("carriageway", 0, -3, 40, 3), face("pavement", 0, 3, 40, 20)])
        sf = street_surfaces(part, [road(0, 10.0)], SQ, lambda x, y: 10.0)
        v = sf["v"]
        self.assertTrue(sf["pave"] and sf["drive"])
        self.assertLessEqual(max(v[3 * i + 1] for i in sf["pave"]), 3 + 2 + 1.5 + 0.01)


if __name__ == "__main__":
    unittest.main()
