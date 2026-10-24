"""The towpath, the canal's tunnels and bridge decks in the writer: on small invented streets."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shapely.geometry import LineString

from partition.write_tile import (_profiled, deck_reach, whole_spans, follow_laid_ground, ground_at, lay_ground, no_span_over_tunnels,
                                  settle_on_laid_ground)
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
        (pts, _, _, _), = _profiled(seg, whole, prof, flat(9.0))
        self.assertTrue(all(abs(q[2] - 10.4) < 0.05 for q in pts))

    def test_a_towpath_through_a_canal_tunnel_is_left_out(self):
        seg = [(float(x), 5.0) for x in range(0, 41, 4)]
        whole = LineString(seg)
        prof = dict(z=[10.4] * 11, span=[], deck=[], bored=[], dip=[], tow=[], gone=[4, 5, 6])
        pieces = _profiled(seg, whole, prof, flat(10.4))
        self.assertEqual(len(pieces), 2)
        self.assertTrue(all(not 14 < q[0] < 26 for pts, _, _, _ in pieces for q in pts))

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
        self.assertEqual(street["dk"], [5.3, 3.5])     # (the path rides on its left)

    def test_a_deck_with_one_pavement_has_its_parapet_at_the_kerb_on_the_other_side(self):
        street = dict(c="unclassified", n="", w=4.8, pv=[0, 2], p=[[0, 0, 10], [10, 0, 12, 1], [20, 0, 12, 1], [30, 0, 10]])
        deck_reach([street])
        self.assertEqual(street["dk"], [2.4, 4.4])

    def test_a_path_crossing_past_the_deck_end_does_not_widen_it(self):
        street = dict(c="residential", n="", w=5, pv=[1, 1], p=[[0, 0, 10], [10, 0, 12, 1], [20, 0, 12, 1], [30, 0, 10]])
        rider = dict(c="footway", n="", w=1.6, p=[[-8, 6, 10, 2], [-9, 9, 10, 2]])
        deck_reach([street, rider])
        self.assertAlmostEqual(street["dk"], 3.5)

    def test_a_bridge_split_between_two_records_is_one_span_from_bank_to_bank(self):
        a = dict(c="unclassified", n="Mill Lane", w=4.5, pv=[0, 1.9],
                 p=[[0, 0, 10], [10, 0, 12, 1], [20, 0, 12, 1]])
        b = dict(c="unclassified", n="Mill Lane", w=4.8, pv=[2, 0],      # drawn the other way
                 p=[[50, 0, 10], [40, 0, 10], [30, 0, 12, 2], [20, 0, 12, 1]])
        rd = [a, b]
        self.assertEqual(whole_spans(rd), 1)
        spans = [r for r in rd if any(len(q) > 3 for q in r["p"])]
        self.assertEqual(len(spans), 1)
        p = spans[0]["p"]
        self.assertEqual((len(p[0]), len(p[-1])), (3, 3))    # both ends on the ground
        self.assertEqual([q[0] for q in p], [0, 10, 20, 30, 40, 50])
        self.assertEqual((spans[0]["w"], spans[0]["pv"]), (4.5, [0, 1.9]))     # (the record on most of it)

    def test_a_joined_bridge_is_cut_again_at_its_banks_once_the_ground_is_laid(self):
        a = dict(c="residential", n="", w=5, pv=[1, 1], p=[[-8, 0, 10], [-4, 0, 10], [0, 0, 10], [4, 0, 12, 1], [8, 0, 12, 1]])
        b = dict(c="residential", n="", w=6, pv=[2, 1], p=[[16, 0, 10], [12, 0, 10], [8, 0, 12, 1]])
        rd = [a, b]
        whole_spans(rd)
        self.assertEqual(len(rd), 1)
        rd[0]["dk"] = 3.5
        whole_spans(rd, cut=True)
        self.assertEqual([[q[0] for q in r["p"]] for r in rd], [[-8, -4, 0], [0, 4, 8, 12], [12, 16]])
        self.assertEqual([(r["w"], r["pv"], r.get("dk")) for r in rd],
                         [(5, [1, 1], None), (5, [1, 1], 3.5), (6, [1, 2], None)])   # (b turned round)

    def test_the_ground_is_dug_for_a_path_dipped_under_a_bridge(self):
        T = grid(20.0)
        bridge = dict(c="residential", n="", w=6, pv=[1.5, 1.5],
                      p=[[60, 10, 20.0], [60, 30, 20.0], [60, 50, 21.0, 1], [60, 70, 21.0, 1], [60, 90, 20.0], [60, 110, 20.0]])
        path = dict(c="cycleway", n="", w=2.5, p=[[x, 60, 17.0] for x in range(30, 91, 10)])
        lay_ground(T, [bridge, path])
        self.assertLess(ground_at(T, 60, 60, split=False), 17.2)
        self.assertAlmostEqual(ground_at(T, 60, 20, split=False), 20.0)
        self.assertAlmostEqual(ground_at(T, 0, 60, split=False), 20.0)       # (the grid's edge)

    def test_a_streets_approach_keeps_its_profile_and_the_ground_is_laid_to_it(self):
        seg = [(float(x), 60.0) for x in range(0, 113, 4)]
        whole = LineString(seg)
        z = [10.0 + 2.0 * min(1.0, max(0.0, (min(i, 28 - i) - 5) / 5)) for i in range(29)]
        prof = dict(z=z, span=list(range(12, 18)), deck=[], bored=[], dip=[], tow=[], gone=[])
        T = grid(10.0)
        (pts, _, lay, _), = _profiled(seg, whole, prof, lambda x, y: ground_at(T, x, y, split=False))
        self.assertEqual([round(q[2], 1) for q in pts[9:12]], [11.6, 12.0, 12.0])
        self.assertNotIn(1, [q[3] if len(q) > 3 else 0 for q in pts[:12]])
        road = dict(c="residential", n="", w=6, pv=[1.7, 1.7], p=pts, _lay=lay)
        change = lay_ground(T, [road])
        settle_on_laid_ground([road], change, lambda x, y: ground_at(T, x, y, split=False))
        self.assertAlmostEqual(ground_at(T, 44, 60, split=False), 12.0, places=1)
        self.assertNotIn("_lay", road)

    def test_what_stood_on_the_ground_follows_it(self):
        T = grid(20.0)
        bridge = dict(c="residential", n="", w=6, p=[[60, 10, 20.0], [60, 30, 20.0], [60, 50, 21.0, 1], [60, 70, 21.0, 1], [60, 90, 20.0]])
        path = dict(c="footway", n="", w=1.6, p=[[x, 60, 17.0] for x in range(30, 91, 10)])
        change = lay_ground(T, [bridge, path])
        tile = dict(tr=[[61.0, 60.0, 20.0, 5.0]], fx=[["bin", 10.0, 100.0, 20.0, 0.0]])
        follow_laid_ground(tile, change)
        self.assertLess(tile["tr"][0][2], 18.0)
        self.assertEqual(tile["fx"][0][3], 20.0)

if __name__ == "__main__":
    unittest.main()
