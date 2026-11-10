"""The partition's own checks, run with `python3 -m unittest discover -s tools/partition/tests`.

The loose-end metric is the one that decides whether a stage may be judged on it, and it once had a
bug that made it always pass: it measured the free end against the square as a *polygon*, whose
distance is zero for every point inside it, so the "inside" count could never be anything but zero.
These tests hold it to a point in the middle of a square (a real loose end) and a point on its
boundary (not one), so the bug cannot come back unseen.

Stage 2's registered parcels are checked the same way, on synthetic geometry rather than the map
data: a plot may not leave the parcel its house stands in, the parcel boundary is the evidence the
plot edge lies on, and a house outside every parcel is divided by the rules exactly as before.
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import unary_union
from shapely.strtree import STRtree

from partition.plots import Parcels, garden_share, make_plots, on_line
from partition.render import loose_ends
from partition.checks import unreachable_plots


def corridors(lines):
    """The (edge, carriageway, pavement-left, pavement-right) tuples the checks take, from plain
    lines: a corridor 6 m wide with a metre of pavement either side."""
    out = []
    for l in lines:
        out.append((dict(cls="residential", line=l, name="test", sections=[]),
                     l.buffer(3.0), l.buffer(-3.0, 0.0).difference(l.buffer(3.0)), 
                     l.buffer(0.0, -3.0).difference(l.buffer(3.0))))
    return out


class UnreachablePlotsTest(unittest.TestCase):
    """The co-developer's three cases for "a plot nobody can get to". The definition is about reachability, not
    about which edge carries which source: a mid-terrace house whose footprint fronts the pavement
    is reached through its front door, and its plot never touching the street is the ordinary case."""

    def setUp(self):
        self.square = (0, 0, 200, 200)      # the square's bounds, as the build passes them

    def test_a_detached_house_in_a_field_is_unreachable(self):
        # a house and its plot alone in a field, with the nearest street 60 m away
        house = box(50, 50, 60, 60)
        plot = box(45, 45, 65, 65)
        roads = corridors([LineString([(0, 130), (200, 130)])])
        found = unreachable_plots(0, 0, [(plot, "plot", 0)], {0: house}, roads, [], [], self.square)
        self.assertEqual(len(found), 1, "a house in a field with no street has no way in")
        self.assertEqual(found[0]["rule"], "plot_unreachable")

    def test_a_detached_house_fronting_a_corridor_is_reachable(self):
        # the house itself fronts the carriageway, so it is reached from the street
        house = box(50, 50, 60, 60)
        plot = box(45, 45, 65, 65)
        roads = corridors([LineString([(0, 48), (200, 48)])])
        found = unreachable_plots(0, 0, [(plot, "plot", 0)], {0: house}, roads, [], [], self.square)
        self.assertEqual(found, [])

    def test_a_terrace_house_fronting_a_corridor_is_reachable_without_its_plot(self):
        # a mid-terrace house: its footprint fronts the pavement, but its plot is the back garden
        # only, which never touches the street. That is the ordinary case, not a finding.
        house = box(50, 48, 60, 60)
        plot = box(45, 60, 65, 90)
        roads = corridors([LineString([(0, 46), (200, 46)])])
        found = unreachable_plots(0, 0, [(plot, "plot", 0)], {0: house}, roads, [], [], self.square)
        self.assertEqual(found, [], "a house on the pavement is reached through its front door")

    def test_a_plot_reached_by_a_drive_is_reachable(self):
        # house and plot both well away from the street, but a drive is recorded on a plot edge
        house = box(50, 50, 60, 60)
        plot = box(45, 45, 65, 65)
        roads = corridors([LineString([(0, 130), (200, 130)])])
        edge = LineString([(65, 45), (65, 65)])
        driving = [dict(edge=0, t=10.0, width=2.8, kind="drive")]
        self.assertEqual(unreachable_plots(0, 0, [(plot, "plot", 0)], {0: house}, roads,
                                           [(edge, "fence", 0.0, "inferred")], driving,
                                           self.square), [])

    def test_a_gated_hedge_is_a_way_through(self):
        # a front garden (plot) separated from the verge (open land) by a hedge with a gate in it:
        # the walk crosses at the gate, so the house is reached. A gate left out of the set of ways
        # through makes every gated garden hedge a solid wall, which was the largest single group of
        # the village square's findings (192 down to 0 once it was counted).
        house = box(48, 50, 60, 60)
        plot = box(45, 45, 65, 61)                      # the front garden, reaching the hedge
        verge = box(45, 61, 65, 68)                     # the verge, on the far side of the hedge
        # the road's own corridor is 3 m either side of its centre line, so it is put at y=67: its
        # near edge (y=64) is clear of the plot (which ends at the hedge, y=61) and touches the verge
        roads = corridors([LineString([(0, 67), (200, 67)])])
        hedge = LineString([(45, 61), (65, 61)])        # along their shared edge
        gate = [dict(edge=0, t=10.0, width=1.0, kind="gate")]
        found = unreachable_plots(0, 0, [(plot, "plot", 0), (verge, "open", None)], {0: house},
                                  roads, [(hedge, "hedge", 0.0, "parcel")], gate, self.square)
        self.assertEqual(found, [], "a gate through the hedge is a way out")

    def test_a_hedge_with_no_gate_is_not(self):
        # the same hedge with no gate: the walk cannot cross, and with no corridor within reach of
        # the plot the house has no way in
        house = box(48, 50, 60, 60)
        plot = box(45, 45, 65, 61)
        far_land = box(45, 61, 65, 120)                 # the ground beyond, with no street at all
        roads = corridors([LineString([(0, 140), (200, 140)])])
        hedge = LineString([(45, 61), (65, 61)])
        found = unreachable_plots(0, 0, [(plot, "plot", 0), (far_land, "open", None)], {0: house},
                                  roads, [(hedge, "hedge", 0.0, "parcel")], [], self.square)
        self.assertEqual(len(found), 1, "no gate, so no way out")

    def test_a_plot_fenced_all_round_is_reported(self):
        # the walk opens at a gate (above) and must still close with no way out. Here the plot is
        # fenced on all four sides with no gate, and open ground beyond every fence reaches the
        # street, so the walk would get out if any fence were missing. Without the fences the plot
        # touches the open ground directly and the house is reached, so it is the fences, and not
        # the absence of a street, that make this unreachable.
        house = box(48, 50, 60, 60)
        plot = box(45, 45, 65, 65)
        around = [box(0, 0, 200, 45), box(0, 65, 200, 200), box(0, 45, 45, 65), box(65, 45, 200, 65)]
        roads = corridors([LineString([(0, 140), (200, 140)])])
        fences = [LineString([(45, 45), (65, 45)]), LineString([(65, 45), (65, 65)]),
                  LineString([(65, 65), (45, 65)]), LineString([(45, 65), (45, 45)])]
        found = unreachable_plots(0, 0, [(plot, "plot", 0)] + [(g, "open", None) for g in around],
                                  {0: house}, roads,
                                  [(f, "fence", 0.0, "parcel") for f in fences], [], self.square)
        self.assertEqual(len(found), 1, "fenced all round with no gate: no way out")

    def test_the_only_way_out_with_no_opening_is_reported(self):
        # the exact mirror of test_a_gated_hedge_is_a_way_through: same geometry, and the only
        # difference is that the hedge has no gate. The open ground beyond it does reach the street,
        # so the house would be reached if the walk could cross; the drawn edge with no opening is
        # what stops it, and the house must be reported.
        house = box(48, 50, 60, 60)
        plot = box(45, 45, 65, 61)
        verge = box(45, 61, 65, 68)
        roads = corridors([LineString([(0, 67), (200, 67)])])
        hedge = LineString([(45, 61), (65, 61)])
        found = unreachable_plots(0, 0, [(plot, "plot", 0), (verge, "open", None)], {0: house},
                                  roads, [(hedge, "hedge", 0.0, "parcel")], [], self.square)
        self.assertEqual(len(found), 1, "a drawn edge with no opening is not a way through")

    def test_a_sealed_plot_in_a_terrace_is_reported(self):
        # a terrace of two: house 0's plot is sealed (a fence all round, no opening) while house 1's
        # garden reaches the street and shares the party wall with it. The two footprints touch, so a
        # start set built from "every face within REACH of the footprint" swallows house 1's garden
        # and reads house 0 as reachable through next door. It is not: house 0 has no way out at all.
        house0 = box(20, 50, 30, 60)                # house 0, the sealed one
        house1 = box(30, 50, 40, 60)                # house 1 next door, sharing the party wall
        sealed = box(18, 38, 30, 62)                # house 0's garden, fenced all round, no opening
        next_garden = box(30, 38, 45, 62)           # house 1's garden, running up to the street
        # the street, well east of house 0 so only house 1's garden reaches it
        roads = corridors([LineString([(48, 0), (48, 100)])])
        fences = [LineString([(18, 38), (30, 38)]), LineString([(30, 38), (30, 62)]),
                  LineString([(30, 62), (18, 62)]), LineString([(18, 62), (18, 38)])]
        # the party wall between the two gardens, drawn as the terrace's shared side wall
        pedges = [(f, "fence", 0.0, "parcel") for f in fences]
        pedges.append((LineString([(30, 38), (30, 62)]), "wall", 0.0, "parcel"))
        plots = [(sealed, "plot", 0), (next_garden, "plot", 1)]
        found = unreachable_plots(0, 0, plots, {0: house0, 1: house1}, roads, pedges, [],
                                  self.square)
        reported = {(r["x"], r["y"]) for r in found}
        self.assertIn((house0.representative_point().x, house0.representative_point().y), reported,
                      "a sealed plot is not reached through next door")


class LooseEndsTest(unittest.TestCase):
    def test_line_ending_in_the_middle_is_a_loose_end(self):
        square = box(0, 0, 100, 100)
        # one line stopping at the centre; its near end is held by a small obstacle, so the only
        # free end is the one in the middle
        others = box(29, 29, 31, 31)
        on_edge, inside, pts = loose_ends([LineString([(30, 30), (50, 50)])], others, square)
        self.assertEqual((on_edge, inside), (0, 1))

    def test_line_ending_on_the_boundary_is_not_a_loose_end(self):
        square = box(0, 0, 100, 100)
        # one line on to the square's boundary, its near end held, so its only free end is the edge
        others = box(49, 49, 51, 51)
        on_edge, inside, pts = loose_ends([LineString([(50, 50), (100, 50)])], others, square)
        self.assertEqual((on_edge, inside), (1, 0))

    def test_two_lines_meeting_are_not_loose(self):
        square = box(0, 0, 100, 100)
        lines = [LineString([(0, 50), (50, 50)]), LineString([(50, 50), (50, 100)])]
        on_edge, inside, pts = loose_ends(lines, None, square)
        # both far ends are on the boundary, the meeting point touches the other line
        self.assertEqual((on_edge, inside), (2, 0))

    def test_a_closed_ring_has_no_free_end(self):
        square = box(0, 0, 100, 100)
        ring = LineString([(40, 40), (60, 40), (60, 60), (40, 60), (40, 40)])
        on_edge, inside, pts = loose_ends([ring], None, square)
        # a boundary drawn as a loop has no end, so it is not a loose end
        self.assertEqual((on_edge, inside), (0, 0))


class ParcelsTest(unittest.TestCase):
    def test_a_square_with_no_buildings_labels_its_open_land(self):
        # An out-of-town square can hold nothing but open land and a couple of lanes, so there are no
        # footprints at all. unary_union([]) is an empty GeometryCollection, whose .boundary is None
        # rather than an empty line, so asking it for its boundary raised AttributeError and lost the
        # whole square (measured: square -7,2 crashed the 131-square city run on this). The land
        # still has to be labelled: a piece surrounded by no building and not on the worked area's
        # edge is beside a corridor.
        block = box(10, 10, 40, 40)
        nothing = unary_union([])
        made, edges = make_plots(block, [], [], STRtree([]), "suburb", None, None,
                                 nothing, box(0, 0, 50, 50), log=lambda *_: None)
        self.assertTrue(made, "the block is still divided, as open land")
        self.assertTrue(all(k == "open" for _g, k, _b in made))

    def test_index_of_says_which_parcel_a_house_stands_in(self):
        west, east = box(0, 0, 30, 100), box(30, 0, 60, 100)
        p = Parcels([west, east])
        self.assertEqual(p.index_of(box(5, 5, 15, 15)), 0)
        self.assertEqual(p.index_of(box(35, 5, 45, 15)), 1)
        # a house in no title at all is divided by the rules, so it must not be given a parcel
        self.assertIsNone(p.index_of(box(100, 100, 110, 110)))

    def test_a_parcel_boundary_is_its_own_evidence(self):
        p = Parcels([box(0, 0, 30, 100)])
        tree, lines = p.ltree, p.lines
        self.assertTrue(on_line(tree, lines, Point(0, 50), 0.1))
        self.assertFalse(on_line(tree, lines, Point(15, 50), 0.1))

    def test_a_title_line_across_open_land_is_not_a_garden_edge(self):
        # a title line that touches one garden at one end and runs off across the fields. Asking
        # whether a house is near it *anywhere* would call it a garden edge and draw a hedge across
        # open land; the share along it is what tells the two apart.
        house = box(0, 0, 10, 10)
        htree = STRtree([house])
        near = LineString([(0, 0), (10, 10)])              # entirely against the house
        across = LineString([(5, 5), (305, 5)])            # touches the garden, then 300 m of field
        self.assertGreaterEqual(garden_share(htree, [house], near), 0.4)
        self.assertLess(garden_share(htree, [house], across), 0.4)

    def test_a_plot_may_not_leave_the_parcel_its_house_stands_in(self):
        # one block, two houses well apart with a registered boundary between them that is *not*
        # where the rules would divide them: the bisector of the gap runs at 30, the title at 25.
        # The plot must stop at the title, which is the whole point of reading the parcels.
        block = box(0, 0, 60, 60)
        a, b = box(5, 10, 15, 25), box(45, 10, 55, 25)
        parcels = Parcels([box(0, 0, 25, 60), box(25, 0, 60, 60)])
        plots, _ = make_plots(block, list(enumerate([a, b])), [], STRtree([]), "suburb",
                              None, None, None, None, parcels=parcels, log=lambda *_: None)
        west = [g for g, kind, bi in plots if kind == "plot" and bi == 0]
        east = [g for g, kind, bi in plots if kind == "plot" and bi == 1]
        self.assertTrue(west and east, "both houses keep a plot")
        self.assertLessEqual(max(g.bounds[2] for g in west), 25.5)
        self.assertGreaterEqual(min(g.bounds[0] for g in east), 24.5)


if __name__ == "__main__":
    unittest.main()
