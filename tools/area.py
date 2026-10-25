"""The game maps. Each is a circle inside a force field, built from the data around its centre.

Every tool takes a map id (a key of MAPS) and reads its settings with area(map_id). Each map has:
- centre (lon, lat): the origin of the map's coordinates;
- field (force field radius, metres), around field_centre (x east, y north, metres from the centre;
  the centre itself if not given), and half (metres from the field's centre to each edge of the
  data, so scenery shows past the field);
- zones: local character areas as circles (zone, x east, y north, radius) in metres from the
  centre, first match wins, and default_zone for everywhere else (see buildings.py);
- view (x, y): what the menu backdrop circles around;
- landmarks (optional): the name of its landmark pack in tools/landmarks/ (the map id if not given);
- wide (optional): a much bigger circle round the detailed map. When a map has one, the force field
  takes it in: field and field_centre in wide replace the ones above, which then only set the
  detailed area's box. The whole circle is built in full-detail squares (tools/prep_tiles.py), the
  detailed area being the middle 3 x 3 of them, with a lighter file underneath for the minimap and
  the distance (tools/prep_wide.py). z0 is the height every square's ground is measured from.
"""
import math
from types import SimpleNamespace

RELEASE = "2026-09-23.1"        # Overture Maps release
CELLS = 261                     # terrain grid cells along each side of a full-detail square

MAPS = {
    "combe-down": dict(
        name="Combe Down",
        centre=(-2.34517, 51.36238),   # lon, lat: the Hadley Arms
        # the force field takes in the old village circle (1 km round the Hadley Arms) and reaches
        # north-west down Lyncombe Vale to the far end of the Devonshire tunnel; the Combe Down
        # tunnel runs right under the village
        field=1465,                    # force field radius in metres: the play area is 2.9 km across
        field_centre=(-410, 220),
        half=1565,
        # the squares are laid out as a partition after prep_map (tools/partition/stage.py), from the
        # Land Registry's parcels and what is kept from the lidar for it
        partition=True,
        # one list for the whole of Bath, first match wins; positions come from named places in the
        # map data, and edges are approximate
        zones=[
            ("mulberry", -660, 30, 270),     # Mulberry Park: the 2016+ redevelopment of the MoD site
            ("foxhill", -930, -230, 380),    # Foxhill: post-war estate of about 900 homes
            ("village", -60, -300, 330),     # old Combe Down: Church Road, Holy Trinity, De Montalt Place
            ("village", 60, -40, 140),       # North Road around the Hadley Arms
            ("victorian", -1350, 1050, 450), # Bear Flat, Wellsway and Devonshire Buildings: Bath stone terraces
            ("victorian", -750, 1150, 350),  # Lyncombe Vale and Lyncombe Hill: Victorian villas
            # the rest of Bath: Royal Victoria Park's zones (see "victoria-park" below), moved to
            # this map's centre, then the rest of the city
            ("georgian", -1592, 2760, 150),   # the Royal Crescent and Crescent Lane
            ("georgian", -1707, 2720, 155),   # Marlborough Buildings
            ("georgian", -1332, 2630, 210),   # Brock Street, the Circus, Rivers Street, Bennett Street
            ("georgian", -1312, 2380, 130),   # Gay Street, Queen's Parade, Queen Square
            ("georgian", -1582, 2950, 110),   # St James's Square
            ("georgian", -1683, 2230, 90),    # Norfolk Crescent
            ("georgian", -1320, 3330, 260),   # Lansdown Crescent, Camden Crescent and the slopes below
            ("georgian", -560, 2420, 280),    # Great Pulteney Street, Laura Place and Sydney Place
            ("riverside", -2142, 2280, 200),  # Western Riverside, between Upper Bristol Road and the Avon
            ("victorian", -2342, 2820, 260),  # Park Lane and Weston Road
            ("victorian", -1842, 3220, 260),  # Cavendish Road and Sion Hill
            ("bath", -1000, 2150, 650),       # the old city round the Abbey, Milsom Street and Southgate
            ("victorian", -2300, 1650, 750),  # Oldfield Park, Westmoreland and the Lower Bristol Road
            ("victorian", -500, 3300, 650),   # Walcot, Larkhall and Fairfield Park
            ("victorian", -3700, 2100, 500),  # Twerton's terraces along the river
            ("victorian", -400, 1450, 350),   # Widcombe and Lyncombe
        ],
        spawn="Firs Field",            # where everyone starts: the green between North Road, The Firs and The Avenue
        default_zone="suburb",
        landmarks="bath",              # tools/landmarks/bath.py
        z0=15,                         # metres: what every square's ground heights are measured from
        # the whole of Bath round it, 11 km across: Lansdown and the racecourse in the north,
        # Saltford's edge and Newton Park in the west, Bathford and Limpley Stoke in the east, and
        # down past Midford and Twinhoe to Wellow in the south
        wide=dict(
            field=5600,
            field_centre=(-2200, 1400),        # about the Oval, south-west of the city centre
            half=6050,                         # data out to here from the field's centre (in a circle, not a box)
        ),
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
    ),
    "pembury": dict(
        # a test of a map outside Bath: 1 km round the Pembury Tavern on Amhurst Road, Hackney
        name="Hackney",
        centre=(-0.05929, 51.54946),   # lon, lat: the Pembury Tavern, on the corner of Amhurst Road and Dalston Lane
        field=1000,                    # force field radius in metres: 2 km across
        half=1100,
        zones=[],
        default_zone="london",         # Victorian London stock-brick terraces and council estates
    ),
    "bradford-on-avon": dict(
        # a town reached by train from Bath Spa, not by walking: its own map, in the same game
        name="Bradford-on-Avon",
        centre=(-2.2522, 51.3448),     # lon, lat: the station, fixed once anything is placed by coordinates
        field=600,                     # force field radius in metres: the detailed box is the middle 3 x 3 squares
        half=1565,                     # metres from the centre to the data edge: matches Bath's square grid
        # Bath stone through the old town and up Newtown and the Shambles; the rest of the town is
        # ordinary suburb. Positions come from named places in the map data, and edges are approximate
        zones=[
            ("georgian", 40, 30, 260),     # the Town Bridge, Market Street and the Shambles
            ("victorian", -160, 260, 300),  # Newtown, Middle Rank and the streets up over the hill
            ("victorian", 220, -140, 300),  # the Tithe Barn and Barton Farm, east along the river
        ],
        spawn="Westbury Gardens",      # where a game started here begins: the park by the station
        default_zone="suburb",
        z0=15,                         # metres: what every square's ground heights are measured from
        # the town and the fields round it, and the Avon valley either side
        wide=dict(
            field=1200,
            field_centre=(0, 100),
            half=1600,
        ),
    ),
}


def area(map_id, wide=False):
    """Settings for one map, plus its data bounding box (W, S, E, N) in lon/lat, centred on the field.
    wide: the settings of the map's wider circle instead (see above), with the same centre."""
    if map_id not in MAPS:
        raise SystemExit(f"unknown map {map_id!r}: choose from {', '.join(MAPS)}")
    settings = MAPS[map_id]
    if wide:
        if "wide" not in settings: raise SystemExit(f"map {map_id!r} has no wide area")
        settings = {**{k: v for k, v in settings.items() if k != "wide"}, **settings["wide"]}
    m = SimpleNamespace(id=map_id, **{"field_centre": (0, 0), "landmarks": map_id, **settings})
    if "wide" in MAPS[map_id]:
        # the squares' grid: the detailed area's box is squares 0-2 each way
        detail = {"field_centre": (0, 0), **MAPS[map_id]}
        (fx, fy), h = detail["field_centre"], detail["half"]
        m.squares = SimpleNamespace(x0=fx - h, y0=fy - h, dx=2 * h / (3 * CELLS), cells=CELLS, z0=detail["z0"])
    lon0, lat0 = m.centre
    kx, ky = 111320 * math.cos(math.radians(lat0)), 110574
    m.middle = (lon0 + m.field_centre[0] / kx, lat0 + m.field_centre[1] / ky)   # lon, lat of the field's centre
    mlon, mlat = m.middle
    m.bbox = (mlon - m.half / kx, mlat - m.half / ky, mlon + m.half / kx, mlat + m.half / ky)
    return m
