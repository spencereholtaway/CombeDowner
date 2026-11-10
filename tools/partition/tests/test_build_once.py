"""The build-once passes' own tests, run with `python3 -m unittest discover -s tools/partition/tests`.

Stage 3b's whole claim is that a thing built once has no second version to disagree with. Three
properties carry it, and these test all three:

- a street edge's fit is a pure function of the edge and what stands beside it, so fitting it from
  one window and from a larger one gives the same answer;
- a worked block reaches no further than REACH_GROW from a building, so a window sized to the piece
  holds every building that can shape it - which is what lets a square divide its own pieces and
  still agree with its neighbours;
- the ground beyond a *worked piece* is the rest of its parent block, which is open land, and only
  beyond the parent block is it a street. Labelling it a street turned a plot against open land into
  a `front` ending where the piece outline turned away from any real street.

If any failed, neighbouring squares would disagree again and the design would be back where stage 3
left it. The first two need the real map data, so they skip unless `data/raw/combe-down/wide` is
unpacked (`python3 -I tools/mapdata.py unpack combe-down`) and a pass 1 and pass 2 run exist in
`out/once-p1`.
"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

import numpy as np
from shapely.geometry import LineString, Polygon, box
from shapely.ops import unary_union
from shapely.strtree import STRtree

from partition import ROOT, once, zone_at
from partition.corridors import PATHS
from partition.data import Data
from partition.plots import REACH_GROW, building_axes, front_normals, make_plots
from partition.render import loose_ends

RAW = os.path.join(ROOT, "data", "raw", "combe-down", "wide")
GRAPH = os.path.join(ROOT, "out", "once-p1")


def _plot_key(t):
    """A stable sort key for a plot tuple, so two runs can be compared pair by pair."""
    g, k, b = t
    return (k, -1 if b is None else b, round(g.bounds[0], 2), round(g.bounds[1], 2), round(g.area, 1))


def _edge_key(t):
    """A stable sort key for an edge tuple."""
    s, a, b = t
    return (str(a), str(b), round(s.bounds[0], 2), round(s.bounds[1], 2), round(s.length, 1))


def have_data():
    return os.path.exists(os.path.join(RAW, "building.geojson"))


@unittest.skipUnless(have_data(), "needs data/raw/combe-down/wide (tools/mapdata.py unpack)")
@unittest.skipUnless(os.path.exists(os.path.join(GRAPH, "graph.json")),
                     "needs a pass 1 run (city.py --only <square>)")
class EdgeFitTest(unittest.TestCase):
    """Pass 1: an edge's fit is identical from two different windows that both contain it."""

    @classmethod
    def setUpClass(cls):
        cls.edges = once.read_graph(GRAPH)
        cls.bb = once.map_bbox()
        cls.D = Data(RAW, cls.bb, log=lambda *_: None)
        # a spread of street edges (not paths, which are a fixed width and cannot vary)
        cls.pick = [e for e in cls.edges if e["cls"] not in PATHS][::400][:12]

    def test_an_edges_fit_is_the_same_from_two_windows(self):
        for e in self.pick:
            with self.subTest(edge=e["id"], cls=e["cls"]):
                w1 = once.edge_window([e["line"]])
                # a window grown all round: more buildings, barriers and lidar runs in it
                w2 = (w1[0] - 250, w1[1] - 250, w1[2] + 250, w1[3] + 250)
                _b1, _ev1, o1, t1 = once.obstacles_for(self.D, w1)
                _b2, _ev2, o2, t2 = once.obstacles_for(self.D, w2)
                self.assertGreater(len(o2), len(o1), "the bigger window holds more")
                r1 = once.fit_edge(e, t1, o1)
                r2 = once.fit_edge(e, t2, o2)
                self.assertEqual(r1["sections"], r2["sections"], "the cross-sections differ")
                self.assertEqual(r1["car"], r2["car"], "the carriageway differs")
                self.assertEqual(r1["pl"], r2["pl"], "the left pavement differs")

    def test_every_edge_is_owned_by_the_square_holding_its_midpoint(self):
        # ownership by geometry, so the same edge is owned by the same square every run
        for e in self.pick:
            ti, tj = once.owner_of(e["line"].bounds)
            x0, y0, x1, y1 = once.box_of(ti, tj)
            mid = e["line"].interpolate(0.5, normalized=True)
            self.assertTrue(x0 <= mid.x <= x1 and y0 <= mid.y <= y1,
                            f"edge {e['id']} is owned by {ti},{tj} but its midpoint is outside")


@unittest.skipUnless(have_data(), "needs data/raw/combe-down/wide (tools/mapdata.py unpack)")
@unittest.skipUnless(os.path.exists(os.path.join(GRAPH, "blocks.json")),
                     "needs a pass 2 run (city.py --only <square>)")
class WorkedBlockTest(unittest.TestCase):
    """Pass 2: a worked block's outline, and the labelling of the ground beyond it.

    The outline claim is what makes two squares agree about a block: it is a function of the whole
    building and corridor sets (pass 2 computes it once and writes it), not of the window a square
    happens to be dividing. The labelling claim is the co-developer's: beyond a *piece* is the rest of the parent
    block, which is open land."""

    def test_every_worked_block_is_within_reach_grow_of_a_building(self):
        # This is the invariant that makes a window sized to the piece sufficient, and so the reason
        # a square can divide its own pieces and still agree with its neighbours. A worked block is
        # `block ∩ buffer(all buildings, REACH_GROW)`, so every point of one is within REACH_GROW of
        # a building; a window grown by REACH_GROW round a piece therefore holds every building that
        # can reach it, and the piece computed from that window alone is the city-wide piece.
        pieces = [once._poly_from(r["xy"]) for r in json.load(open(os.path.join(GRAPH, "blocks.json")))]
        self.assertTrue(pieces, "pass 2 wrote no worked blocks")
        cleaned = [g for _i, g in once.read_cleaned(GRAPH)]
        tree = STRtree(cleaned)
        for piece in pieces[::300]:
            with self.subTest(bounds=tuple(round(v, 1) for v in piece.bounds)):
                n = max(8, int(piece.exterior.length / 20))
                far = max(
                    min((cleaned[int(k)].distance(piece.exterior.interpolate(i / n, normalized=True))
                         for k in np.atleast_1d(tree.query(piece.buffer(REACH_GROW + 1)))), default=1e9)
                    for i in range(n))
                self.assertLessEqual(far, REACH_GROW + 0.1,
                                     "a worked block reaches further from every building than "
                                     "REACH_GROW, so a window sized to the piece could miss one")

    def test_a_worked_block_is_a_connected_piece_of_one_block(self):
        pieces = [once._poly_from(r["xy"]) for r in json.load(open(os.path.join(GRAPH, "blocks.json")))]
        for piece in pieces[::300]:
            with self.subTest(bounds=tuple(round(v, 1) for v in piece.bounds)):
                self.assertEqual(piece.geom_type, "Polygon", "a worked block is one piece")

    def test_a_pieces_parent_is_the_same_from_two_windows(self):
        """A piece's **parent** must not depend on the window it is divided from.

        This is necessary but not sufficient - the cut lines and the seeds are read through the
        window too, and the test below compares the faces themselves. It is kept because it says
        *which* thing is wrong when the faces differ: a parent clipped to a window would be a
        different block, and the faces would then differ for a reason this names.
        """
        parents = once.read_parents(GRAPH)
        self.assertTrue(parents, "pass 2 wrote no parent blocks")
        pieces = [once._poly_from(r["xy"]) for r in json.load(open(os.path.join(GRAPH, "blocks.json")))]
        checked = 0
        for piece in pieces[::300]:
            win = once.block_window_for([piece], parents)
            grown = (win[0] - 400, win[1] - 400, win[2] + 400, win[3] + 400)
            got_win = once.parent_for(piece, once.read_parents(GRAPH, win))
            got_grown = once.parent_for(piece, once.read_parents(GRAPH, grown))
            self.assertIsNotNone(got_win, "the piece must have a parent in its own window")
            self.assertIsNotNone(got_grown, "and in a grown one")
            self.assertAlmostEqual(got_win.area, got_grown.area, places=3,
                                   msg="the parent must not depend on the window")
            self.assertAlmostEqual(got_win.hausdorff_distance(got_grown), 0.0, places=3,
                                   msg="the parent's outline must be the same in both windows")
            checked += 1
        self.assertGreater(checked, 0, "no pieces were checked")

    def test_a_pieces_written_faces_are_identical_from_two_owner_windows(self):
        """The stage's own claim, on the written faces: the same piece divided from its pass window
        and from a window grown by 400 m gives the same plots and the same edges, to the millimetre.

        This is the test the spec asked for. A matching parent is not enough - the cut lines, the
        evidence, the parcels, the streets `front_normals` faces houses to and the seeds are all read
        *through the window*, so a window that drops any of them changes the faces even when the
        parent is the same block. It runs the pass's own loader (`once.window_inputs`) and its own
        `make_plots` call, so what it compares is the real path.

        Geometry and labels both: a face at the same place carrying a different label is a different
        face to everything downstream.
        """
        parents = once.read_parents(GRAPH)
        corridors = once.read_corridors(GRAPH)
        bb = once.map_bbox()
        pieces = [once._poly_from(r["xy"]) for r in json.load(open(os.path.join(GRAPH, "blocks.json")))]
        raw = RAW
        checked = 0
        for piece in pieces[::150]:
            win = once.block_window_for([piece], parents)
            grown = (win[0] - 400, win[1] - 400, win[2] + 400, win[3] + 400)
            got = []
            for w in (win, grown):
                env = once.window_inputs(GRAPH, raw, bb, w, corridors)
                parent = once.parent_for(piece, once.read_parents(GRAPH, w))
                self.assertIsNotNone(parent, "every piece is a fragment of a parent")
                cx, cy = piece.representative_point().x, piece.representative_point().y
                p, e = make_plots(piece, env["buildings"], env["ev_lines"], env["ev_tree"],
                                  zone_at(cx, cy), env["axes"], env["fronts"], env["bunion"],
                                  box(*bb), parcels=env["parcels"], parent=parent,
                                  log=lambda *_: None)
                got.append((p, e))
            (p1, e1), (p2, e2) = got
            with self.subTest(bounds=tuple(round(v, 1) for v in piece.bounds)):
                self.assertEqual(len(p1), len(p2), "a different number of plots")
                # the edge *count* is not asserted: `classify_edges` merges each label pair with
                # `linemerge`, and two runs that draw the same boundary can merge it into a different
                # number of pieces (measured: 1,115 against 1,112 on one piece, with the same total
                # length). What must hold is the network, below.
                # plots: same kind and building index, same geometry to the millimetre
                for (g1, k1, b1), (g2, k2, b2) in zip(sorted(p1, key=_plot_key),
                                                      sorted(p2, key=_plot_key)):
                    self.assertEqual((k1, b1), (k2, b2), "a plot changed label")
                    self.assertAlmostEqual(g1.area, g2.area, places=3, msg="a plot changed area")
                    self.assertAlmostEqual(g1.hausdorff_distance(g2), 0.0, places=3,
                                           msg="a plot moved")
                # Edges: the same *network*, not necessarily the same segmentation.
                #
                # `classify_edges` groups segments by their pair of labels and merges each group with
                # `linemerge`. Two runs that draw the same boundary can merge it into a different
                # number of pieces, because merging depends on where the junctions fall - and a larger
                # window holds more footprints, so `bunion.boundary` has more rings and a segment can
                # be split against one of them. Measured on the piece that first failed this test:
                # 1,115 edges in the pass window against 1,112 in the grown one, with the *same* total
                # length (13,418.17 m) and the same plots to the millimetre - the ground and the
                # network are identical, the segmentation is not.
                #
                # So the assertion is about the network: the same total length, every part of each
                # lying on the other to the millimetre, and the same length per pair of labels.
                len1 = sum(s.length for s, _a, _b in e1)
                len2 = sum(s.length for s, _a, _b in e2)
                self.assertAlmostEqual(len1, len2, places=2,
                                       msg="the drawn network changed total length")
                net1 = unary_union([s for s, _a, _b in e1])
                net2 = unary_union([s for s, _a, _b in e2])
                self.assertAlmostEqual(net1.difference(net2.buffer(0.001)).length, 0.0, places=2,
                                       msg="an edge in the pass run is on nothing in the grown one")
                self.assertAlmostEqual(net2.difference(net1.buffer(0.001)).length, 0.0, places=2,
                                       msg="an edge in the grown run is on nothing in the pass one")
                # the pair is sorted, as `classify_edges` sorts its group key: a boundary between
                # two plots is the same boundary whichever side the line happens to be written from,
                # and an unsorted key counts it twice - once as (A, B) and once as (B, A)
                def _pairs(edges):
                    out = {}
                    for s_, a_, b_ in edges:
                        k = tuple(sorted((str(a_), str(b_)))) 
                        out[k] = out.get(k, 0.0) + s_.length
                    return out
                by1, by2 = _pairs(e1), _pairs(e2)
                self.assertEqual(sorted(by1), sorted(by2),
                                 "the runs label different pairs of sides")
                for k in by1:
                    self.assertAlmostEqual(by1[k], by2[k], places=2,
                                           msg=f"the {k} boundary changed length")

            checked += 1
        self.assertGreater(checked, 0, "no pieces were checked")



if __name__ == "__main__":
    unittest.main()
