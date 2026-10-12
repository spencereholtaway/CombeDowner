"""The game maps. Each is a circle inside a force field, built from the data around its centre.

Every tool takes a map id (a key of MAPS) and reads its settings with area(map_id). Each map has:
- centre (lon, lat), field (force field radius, metres) and half (metres from the centre to each
  edge of the data, so scenery shows past the field);
- zones: local character areas as circles (zone, x east, y north, radius) in metres from the
  centre, first match wins, and default_zone for everywhere else (see buildings.py);
- view (x, y): what the menu backdrop circles around.
"""
import math
from types import SimpleNamespace

RELEASE = "2026-09-23.1"        # Overture Maps release

MAPS = {
    "combe-down": dict(
        name="Combe Down",
        centre=(-2.34517, 51.36238),   # lon, lat: the Hadley Arms
        field=1000,                    # force field radius in metres: the play area is 2 km across
        half=1100,
        # positions come from named places in the map data; edges are approximate
        zones=[
            ("mulberry", -660, 30, 270),     # Mulberry Park: the 2016+ redevelopment of the MoD site
            ("foxhill", -930, -230, 380),    # Foxhill: post-war estate of about 900 homes
            ("village", -60, -300, 330),     # old Combe Down: Church Road, Holy Trinity, De Montalt Place
            ("village", 60, -40, 140),       # North Road around the Hadley Arms
        ],
        spawn="Firs Field",            # where everyone starts: the green between North Road, The Firs and The Avenue
        default_zone="suburb",
    ),
    "victoria-park": dict(
        name="Royal Victoria Park",
        # between the Great Dell at the park's west end and the Circus, which both just fit
        centre=(-2.3708, 51.3868),
        field=600,                     # 1.2 km across
        half=750,
        zones=[
            ("georgian", 190, 60, 150),      # the Royal Crescent and Crescent Lane
            ("georgian", 75, 20, 155),       # Marlborough Buildings
            ("georgian", 450, -70, 210),     # Brock Street, the Circus, Rivers Street, Catharine Place, Bennett Street
            ("georgian", 470, -320, 130),    # Gay Street, Queen's Parade, Queen Square
            ("georgian", 200, 250, 110),     # St James's Square
            ("georgian", 99, -470, 90),      # Norfolk Crescent
            ("riverside", -360, -420, 200),  # Western Riverside, between Upper Bristol Road and the Avon
            ("victorian", -560, 120, 260),   # Park Lane and Weston Road, west of the park
            ("victorian", -60, 520, 260),    # Cavendish Road and Sion Hill, up the hill to the north
        ],
        default_zone="bath",
        view=(170, 50),                # the Royal Crescent, seen across its lawn
        # built by hand (see landmarks.py): which terrace, facing which street
        landmarks=[("crescent", "Royal Crescent"), ("circus", "The Circus")],
    ),
}


def area(map_id):
    """Settings for one map, plus its data bounding box (W, S, E, N) in lon/lat."""
    if map_id not in MAPS:
        raise SystemExit(f"unknown map {map_id!r}: choose from {', '.join(MAPS)}")
    m = SimpleNamespace(id=map_id, **MAPS[map_id])
    lon0, lat0 = m.centre
    dlon = m.half / (111320 * math.cos(math.radians(lat0)))
    dlat = m.half / 110574
    m.bbox = (lon0 - dlon, lat0 - dlat, lon0 + dlon, lat0 + dlat)
    return m
