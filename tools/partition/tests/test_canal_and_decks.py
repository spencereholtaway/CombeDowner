"""The towpath, the canal's tunnels and bridge decks in the writer: on small invented streets."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shapely.geometry import LineString

from partition.write_tile import _profiled, cut_under_bridges, deck_reach, ground_at, no_span_over_tunnels
from structures import canal_bores


def flat(z):
    return lambda x, y: z


def grid(z, n=30, d=4.0):
    return dict(nx=n, ny=n, x0=0.0, y0=0.0, dx=d, dy=d, z0=0, h=[int(z * 10)] * (n * n))


class Towpath(unittest.TestCase):
    def test_a_towpath_keeps_the_canal_level_over_lower_ground(self):
        seg = [(float(x), 5.0) for x in range(0, 41, 4)]
        whole = LineString(seg)
        prof = dict(z=[10.4] * 11, span=[], deck=[], bored=[], dip=[], tow=list(range(11)), gone=[])
        (pts, _), = _profiled(seg, whole, prof, flat(9.0))
        self.assertTrue(all(abs(q[2] - 10.4) < 0.05 for q in pts))

    def test_a_towpath_through_a_canal_tunnel_is_left_out(self):
        seg = [(float(x), 5.0) for x in range(0, 41, 4)]
        whole = LineString(seg)
        prof = dict(z=[10.4] * 11, span=[], deck=[], bored=[], dip=[], tow=[], gone=[4, 5, 6])
        pieces = _profiled(seg, whole, prof, flat(10.4))
        self.assertEqual(len(pieces), 2)
        self.assertTrue(all(not 14 < q[0] < 26 for pts, _ in pieces for q in pts))

    def test_the_canals_tunnels_are_found_portal_to_portal(self):
        p = [[x, 0, 3.0, 0, 0, 0, 1 if 20 <= x <= 60 else 0] for x in range(0, 81, 10)]
        bores = canal_bores({"runs": [{"p": p, "lv": 10}]})
        self.assertTrue(bores.contains(LineString([(30, 0), (50, 0)])))
        self.assertFalse(bores.intersects(LineString([(70, -1), (80, 1)])))


class Decks(unittest.TestCase):
    def test_a_street_losing_its_span_over_a_canal_tunnel_comes_down_to_the_ground(self):
        rd = [dict(c="trunk", n="", w=8, pv=[2, 2], p=[[0, 0, 12.0], [10, 0, 14.0, 1], [20, 0, 14.0, 1], [30, 0, 12.0]])]
        canal = {"runs": [{"p": [[15, -20, 3, 0, 0, 0, 1], [15, 20, 3, 0, 0, 0, 1]], "lv": 8}]}
        no_span_over_tunnels(rd, canal, [], [], flat(12.0))
        self.assertTrue(all(len(q) == 3 and abs(q[2] - 12.0) < 0.45 for q in rd[0]["p"]))

    def test_a_deck_fits_its_street_and_takes_in_a_path_riding_it(self):
        street = dict(c="residential", n="", w=5, pv=[1, 1], p=[[0, 0, 10, 0], [10, 0, 12, 1], [20, 0, 12, 1], [30, 0, 10, 0]])
        street["p"] = [q[:3] if q[3] == 0 else q for q in street["p"]]
        deck_reach([street])
        self.assertAlmostEqual(street["dk"], 3.5)
        rider = dict(c="footway", n="", w=1.6, p=[[10, 4.5, 12, 2], [20, 4.5, 12, 2]])
        deck_reach([street, rider])
        self.assertAlmostEqual(street["dk"], 5.3)

    def test_the_ground_is_cut_to_a_path_buried_under_a_bridge(self):
        T = grid(20.0)
        bridge = dict(c="residential", n="", w=6, pv=[1.5, 1.5],
                      p=[[60, 10, 21.0], [60, 50, 21.0, 1], [60, 70, 21.0, 1], [60, 110, 21.0]])
        path = dict(c="cycleway", n="", w=2.5, p=[[20, 60, 17.0], [60, 60, 17.0], [100, 60, 17.0]])
        cut_under_bridges(T, [bridge, path])
        self.assertLess(ground_at(T, 60, 60, split=False), 17.5)
        self.assertAlmostEqual(ground_at(T, 60, 10, split=False), 20.0)
        self.assertAlmostEqual(ground_at(T, 20, 60, split=False), 20.0)


if __name__ == "__main__":
    unittest.main()
