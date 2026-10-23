"""Building cleaning and the lon/lat window test."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shapely.geometry import box

from partition.buildings import clean_buildings
from partition.__main__ import paths_from
from partition.data import _lonlat_bounds
from partition.plots import Parcels


class BuildingsTest(unittest.TestCase):
    def test_a_dropped_footprint_takes_nothing_from_its_neighbour(self):
        # the small one is cut to nothing by the big one before it, so it must not cut the big one's
        # neighbour in turn
        big = box(0, 0, 10, 10)
        tiny = box(8, 0, 12, 2)                 # all but 4 m2 of it lies in big, so it is dropped
        later = box(11, 0, 20, 10)              # overlaps only the part of tiny that is dropped
        res, _ = clean_buildings([big, tiny, later])
        self.assertAlmostEqual(sum(p.area for p in res), 190, delta=0.5)

    def test_a_snapped_bow_tie_does_not_stop_the_cleaning(self):
        from shapely.geometry import Polygon
        bow = Polygon([(0, 0), (10, 10), (10, 0), (0, 10)])
        res, _ = clean_buildings([bow, box(10.3, 0, 20, 10)])
        self.assertTrue(all(p.is_valid for p in res))


class SingleFootprintTest(unittest.TestCase):
    def test_a_footprint_with_two_parts_comes_out_as_one_polygon(self):
        from shapely.geometry import MultiPolygon
        two = MultiPolygon([box(0, 0, 10, 10), box(20, 0, 25, 5)])
        res, _ = clean_buildings([two])
        self.assertEqual([p.geom_type for p in res], ["Polygon"])


class WindowBoundsTest(unittest.TestCase):
    def test_a_collection_has_its_real_envelope(self):
        g = {"type": "GeometryCollection", "geometries": [
            {"type": "Point", "coordinates": [-2.35, 51.38]},
            {"type": "LineString", "coordinates": [[-2.36, 51.37], [-2.34, 51.39]]}]}
        self.assertEqual(_lonlat_bounds(g), (-2.36, 51.37, -2.34, 51.39))

    def test_a_polygon_is_walked_as_before(self):
        g = {"type": "Polygon", "coordinates": [[[0, 0], [2, 0], [2, 3], [0, 0]]]}
        self.assertEqual(_lonlat_bounds(g), (0, 0, 2, 3))


class CommandLineTest(unittest.TestCase):
    def test_terrain_follows_raw_wherever_raw_is_given(self):
        raw, terrain = paths_from(["0", "0", "out", "--raw", "/somewhere/wide"])
        self.assertEqual((raw, terrain), ("/somewhere/wide", "/somewhere/wide/terrain15"))

    def test_terrain_can_be_named_itself(self):
        _, terrain = paths_from(["--terrain", "/t", "--raw", "/r"])
        self.assertEqual(terrain, "/t")


class NoParcelsTest(unittest.TestCase):
    def test_a_missing_parcels_file_is_no_parcels(self):
        par = Parcels(None)
        self.assertEqual((par.polys, par.lines), ([], []))
        self.assertEqual(par.near(box(0, 0, 10, 10)), [])
        self.assertIsNone(par.index_of(box(1, 1, 2, 2)))


if __name__ == "__main__":
    unittest.main()
