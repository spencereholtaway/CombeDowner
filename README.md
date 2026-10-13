# Combe Downer

A multiplayer first-person shooter in the browser, set in Bath. Each map is a circle inside a force
field, built from real open data: Overture Maps buildings, roads, walls, woods and water, on
Environment Agency lidar terrain.

- **Combe Down**: the village around the Hadley Arms, inside the whole of Bath: the force field
  is 11 km across, from Lansdown and the racecourse down to Wellow, and from Newton Park to
  Bathford. The city is built to the same detail as the village (gardens, walls, doors, lamps,
  parked cars, shop signs), in squares about a kilometre across that load
  in around you as you go, and it all plays the same everywhere: traffic, chavs, cats, pickups,
  buses to call, cars to drive and balls on the pitches, in town just as in the village. Grab a car
  and drive into town. Up on Bathampton Down stands Eric's
  oak, in memory of our friend Eric Benjamin Holmes. Down in Twerton is Twerton Park, Bath City's
  ground: the old Main Stand with BATH CITY picked out in its seats, the covered Popular Side, the
  big open Bristol End, the shallow Bath End, the dugouts, hoardings and floodlight pylons. You can
  climb the terraces and sit in the stand.

It's a big map, so the pause menu (Esc, or II on a touch screen) has Go to a pub: a map of the whole
force field with a pint on every pub in it, about a hundred across Bath. Scroll or pinch to zoom
and drag to look about; point at a pub for its name, how far it is and its food hygiene rating from
the Food Standards Agency where there is one, and click it to be on the pavement outside, facing
the door (click where the pubs crowd together, in the middle of town, and the map zooms in). You
can't go while you're dead or within five seconds of being hurt, so it's no way out of a fight.

Day turns to night and back again every 24 minutes: the sun comes up in the east and goes down
in the west with a warm glow round it, then the stars and the moon come out, the street lamps
light the pavements round them and windows light up across Bath. Everyone sees the same time of
day, since it comes from the clock rather than the host. After dark the cats get braver: more of
them are out, the calm ones come and sit round your feet, and shoot one and half as many again
come for you. To see a time of day, add ?time=21:30 to the address (the clock stops there), or
?daylen=4 for a four-minute day; the debug panel's "+3 hours" moves your own clock on.

F3 (or Debug info in the pause menu, on a phone or iPad) opens a debug panel: where you are, in the
game's coordinates and as a real place (latitude and longitude and an OS grid reference), which way
you're facing and which square of Bath you're in; the frame rate and draw calls; and how your link
to each player is doing (direct or through the relay, round trip, lost voice packets, who's
talking). Shift+F3 or its Copy button copies your position. Add ?debug=1 to the address to open it
from the start.

The roads, paths, canal and railways cross each other on proper bridges: every bridge has a deck
with Bath-stone parapets, abutments where it leaves the ground, piers along a long span and
arches where it stands high enough, with the river, the railway or the road it crosses running
on underneath (Pulteney Bridge has its shops along it, and the Dundas Aqueduct carries the canal
over the Avon and the railway). Roads rise and fall like roads rather than following every bump
of the survey, sit in cuttings and on embankments with sloping sides, and the river banks slope
down to the water instead of dropping off a cliff. Walls, fences and hedges stop at the kerb and
leave a gap for every path that crosses them.

A second map, Royal Victoria Park, is set up in `tools/area.py` but left out of the game for now:
build it as below and add it back to `web/src/maps.ts` to try it.

Chavs hang about in gangs on street corners, in alleys, at bus stops and outside the shops and pubs all over Bath, Fox Hill most of all, and there's always a few outside the Hadley Arms. Get spotted and they chase you: they're faster than a walk
but slower than a sprint, and they give up if you get far enough away or out of sight. If they
catch you they hit you. Shooting anyone, player or chav, splatters them in your paint: it splashes
on the ground round them and they leave painted footprints for a few seconds.

Up at the top of town, within 100 m of 1 Fonthill Road, lives Bendy: four metres of black, rubbery
limbs with a pale grinning face and a lamp in his forehead. He walks his patch slowly, sweeping the
land with his lamp's beam like a lighthouse. Get caught in the beam and he screeches, the beam goes
red and locks on you, and then he comes: he sinks into the ground and pops up right beside you,
lashes out with his long arms, and does it again and again, so running doesn't help. Shoot him and
he comes for you. He takes over a hundred rifle rounds to put down (under fifty in the head), so bring
friends; a roof is out of his reach, and get far enough from his patch and he gives up and goes
home. When he goes down he melts into a puddle of ink and leaves three of the best prizes behind,
and a few minutes later he's back. While he's near, his health shows across the top of the screen,
and he's a purple dot on the map.

You start with a rifle and 120 spare rounds. Keys 1, 2 and 3 pick your fists, the rifle and the
sniper rifle, and right click toggles aiming. The sniper rifle has 10-round magazines, a bolt to
work between shots and a scope that sways. The middle of Firs Field is the special spot: each time
it fills it's either a sniper rifle or a bottle of Co-op Bucks Fizz, which fills you right up. The
Hadley Arms and the King William always have a pint outside (40 health). Three more sniper rifles,
tins of rifle rounds, boxes of sniper rounds and the odd pint turn up outside shops and pubs and on
street corners near you, wherever you are in Bath, and chavs sometimes drop a pint, a bottle or some rounds. Picking up a second sniper
rifle, a tin or a box adds a spare magazine. Run dry and it's fists.

It's paintball by default. The rifle and the sniper rifle are paintball markers, with a hopper of
paintballs on top and an air tank for a stock, and they fire paintballs you can watch fly. Each
player's paint is their own colour: it bursts where it lands and leaves splats on walls and the
ground, and goes round the edge of your screen when you're hit. There's no blood. For the real
guns and blood (sprays off every hit, blood up the wall behind whoever you shoot, a red mist off
headshots and sniper rounds, and big pools), add `?gore=1` to the address (`?gore=0` to go back), or type `claret` while you're
playing (again to go back). The browser remembers it, so it carries over into rooms you join and
the mines, and it's only what you see: everyone else keeps their own setting.

Pitches are marked out for the sport they're mapped for: football pitches with goals and nets,
rugby pitches with H posts, and cricket fields with a wicket and a boundary rope. Now and then, on
any of these anywhere in Bath (Twerton Park's included), a ball turns up for you (a white dot on the map). On a football pitch
it's on the penalty spot, or out on the edge of the box for a harder one: put it in the net, under
the bar. On a rugby pitch it's on a kicking tee in front of the posts, sometimes an easy one and
sometimes a long one from out wide; on a cricket field it's at the bowler's end of the wicket, to bowl at the
stumps at the other end (pitch it short and it bounces over them, too full and it's over the bails,
and one that bounces more than once doesn't count). Walk up to it to line up: A and D aim, W and S set the power, Space or a click kicks or
bowls it and E walks off (on a touch screen: the stick, Fire and Jump). Dots trace the start of the ball's
flight as it would go on a still day, but each ball has its own wind (shown under the power bar) and
you have to aim off to allow for it. Score a goal, kick it over the bar between the uprights, or
knock the stumps over, and a prize lands in the goalmouth, under the posts or behind the stumps:
Bucks Fizz, a sniper rifle, rounds, or a bottle of Lucozade, which doubles your damage for 30
seconds. A long kick from out wide, or a goal from the edge of the box, gets one of the better ones. Once the ball's gone, the telly takes over: a
chase camera and a shot from behind the posts for a kick, the long lens from behind the bowler's arm
and a stump-level shot for a ball, in letterbox and slow motion at the moment that matters. Any key
or a click goes back to your own eyes.

The cars parked along The Firs (by Firs Field) and Fox Hill have their keys in: Ford Escort XR3is,
Reliant Robins, Vauxhall Novas, Austin Metros, Ford Sierras, a Police Sierra (with a siren and
flashing lights), a Transit van, a Mr Whippy van (playing Greensleeves), a milk float and a Sinclair
C5. Badgerline double-deckers and minibuses wait at bus stops, and every so often a bus nobody's
using turns up at another stop. Or call one: stand at any stop in Bath, press E, then 1 for a minibus or 2
for a double-decker, and a Badgerline driver brings one down the street (a green dot on the map)
and gets off at the kerb for you; each cricket club has its heavy roller out. Walk up to one and press
E (or Get in on a touch screen): you take the wheel if it's free, otherwise a passenger seat, where
you can look about and shoot (the bus's top deck is the place to be). Drivers get a chase camera: W
and S drive and brake, A and D steer, Space is the handbrake, H or a click sounds the horn (or
switches the siren or the chimes on and off), and E gets you out. The front wheels turn with the
steering and the car turns about its back axle, so it sweeps round a corner on its turning circle
(the traffic drives the same way) rather than pivoting on the spot. Vehicles block like walls and
rounds go through their windows, so you can shoot the driver. Anyone you hit at speed goes under,
the heavier the vehicle the worse, and the roller flattens people at a crawl. Take a Robin round a
corner too fast and it goes over; drive the milk float into something and the bottles go. The
traffic gives way when you drive into it, and so do the cars parked along every street in Bath and
any vehicle nobody's in: you lose a bit of speed and plough on, and the car you hit is knocked
spinning off its line or out of its parking space (a bus barely notices, a C5 bounces off). T-bone one hard and it
trips over its wheels and rolls; if it comes to rest on its roof it catches fire and goes up a
moment later. The fireball hurts any chavs, rugby lads, cricketers or Bendy near it (never players,
and never the cats), counts as your kill, and throws the rest of the traffic about, which can set
off another. Some gangs of chavs arrive in a Nova and pile out. The host says who sits where, and everyone sees the
vehicles where their drivers left them (`web/src/vehicles.ts`).

The Kennet and Avon Canal runs round the east of the map, from the River Avon at Widcombe up the
six locks of the Widcombe flight (Bath Deep Lock is nearly six metres), through the two short
tunnels in Sydney Gardens, out past Bathampton and Claverton and over the Dundas Aqueduct, with the
Somerset Coal Canal's arm off to Brassknocker Basin. Its water sits at the right level all the way,
and it's lined with moored narrowboats. The locks work: walk up to one and press E (Use on a touch
screen) to lean on a balance beam, and the gates swing shut, the water roars through the paddles
and the chamber fills or empties, then the gates at the other end open. Narrowboats chug along,
keeping right of each other, and wait at each lock while their crew works it. Hop aboard and you
ride along on the roof; walk to the back and press E to take the tiller: W and S work the throttle
(it stays where you leave it), A and D put the tiller over, and E lets go. The rudder's at the
stern, so the boat only answers while it's moving, and slowly: it swings its bow round and keeps
turning until you bring the tiller back, and it sets you over towards the bank until you
straighten up, so steer early and straighten early. A tiller held over at a junction picks that
branch.
Take a boat up the flight and you work the locks yourself. The host runs the locks and boats
(`web/src/canal.ts`, laid out by `tools/canal.py`).

The railways run too: InterCity 125s on Brunel's Great Western main line, along the viaduct through
Bath Spa and on through Oldfield Park and the Twerton tunnels, and Sprinters down the Limpley Stoke
valley line that joins it at Bathampton, stopping at the stations. Trains keep to the clock, so
everyone sees the same ones; they sound their horns at anyone on the line ahead and run down anyone
who stays there. Get up on the roof of one and it takes you with it (`web/src/railway.ts`, laid out
by `tools/railway.py`). The lines are on the minimap and the big map, dashed like a railway on an
Ordnance Survey map.

The cable car Curo proposed in 2017, and dropped after a public consultation, runs from Mulberry
Park down to the river at Bath Spa. Two big cabins shuttle on their own ropes, one going down as the
other comes up, out over Lyncombe Vale to a tower on Beechen Cliff and down over Holloway. Walk into
a cabin while its doors are open at either station and it takes you across in a couple of minutes,
or stand on its roof for the view. The cabins keep to the clock like the trains, so everyone sees
the same ones (`web/src/cableway.ts`, laid out by `tools/cableway.py`).

**COMBE DOWN WITH ME** is a co-op cooking game in the kitchen of the Darling Deli, for one to four
cooks (`web/deli.html`, `web/src/deli/`). Walk up to the deli's front door, under the orange neon
sign, and press E (Go in on a touch screen), or pick it from the front page. You all work one
three-minute shift: tickets come in along the top, and you fetch food from the crates, chop loaves,
cheddar and tomatoes on the boards, fry bacon and eggs on the hobs, bake Bath bun dough in the oven,
put it together on a plate and hand it through the pass. The menu is a Bath Bun, a Bacon Butty, a
Ploughman's, a Cheese & Tomato Sarnie and The Full Combe Down. Anything left on the heat burns (bin
it), quick service earns a bigger tip, and customers who wait too long walk out. Takings earn up to
three stars. WASD or the arrows walk, Space or E picks up and puts down, and holding F or Shift
chops; on a touch screen you walk with your thumb anywhere on the left and use the Grab and Chop
buttons. On a phone held upright the kitchen turns to fit. The party name carries over from the
street, and leaving puts you back outside the deli. Cooks can talk to each other: your mic is open
in the kitchen and everyone hears everyone, with a switch for it on the menu.

Other players wear a jacket in their own colour, with their own face, hair or beanie, trousers and
shoes. Their head turns and tilts to look wherever they're looking, they hold their gun up along
the same line (it kicks when they fire), their legs walk, run, crouch and tuck up in a jump, they
blink, and their mouth moves while they talk.

Press Z (or tap Crouch twice on a touch screen) to lie on your front. You crawl along slowly with
your eyes just off the ground and you're much harder to hit, but to everyone else you're a baby
doing tummy time: flat on a patchwork play mat, propped up on your forearms with a big wobbly
head, a dummy in and a rattle in your hand, legs kicking away. Press Z again, or jump, to get up.

Online games have voice chat. Your mic is open to players nearby: they hear you in 3D from where
you stand, fading out by 60 m. Hold V (or the Radio button on touch screens) to talk to everyone
in the room on the radio, through a crackly walkie-talkie filter with a squelch and an "over" beep.
The browser asks for the microphone as you join, and you can mute it from the pause menu.
If someone in the room is on a different version of the game (voice chat needs everyone on the
same one), a small note at the top of the screen says who should refresh; tap it to refresh or hide it.

The sound effects and the soundtrack (procedural 90s-shooter metal, `web/src/music.ts`) are
synthesised in the browser, so the game ships no audio files.

The look is a modern take on 90s Build-engine shooters: chunky pixel-art textures drawn in the
browser (`web/src/textures.ts`), leafy swaying trees and shrubs (`web/src/trees.ts`), tufts of grass
with buttercups and daisies around you (`web/src/grass.ts`), and a punchy colour grade with a fine
palette dither over the frame, drawn at about 540 lines and scaled up in crisp square pixels
(`web/src/post.ts`). Add `?fx=0` to the URL to turn the grade off, or `?res=full` for full resolution.

Multiplayer is peer to peer (WebRTC via [Trystero](https://github.com/dmotz/trystero)): you type a
game name (like `HADLEY`) and press Play. If that game is running you join it, on its map; if not,
you start it on the map you picked. If everyone in that game has gone down the mines, it says so
and offers to take you down after them. Tell your friends the name, or share the link, and browsers
connect directly. There is no game server.
The big map (M, or tap the minimap) zooms in with the mouse wheel, + and −, or a pinch, and drags
about when zoomed (with the mouse captured, push the crosshair against its edge).
When someone joins or leaves, a notice pops up in the middle of the screen above the street sign.
The league table (hold Tab) also shows the game's name, map and how many are playing.
Everyone else in the game shows on the minimap and the big map as an arrow
in their colour, pointing the way they face, with their name on the big map and a red ring round
them while they're shooting. On the minimap, anyone out of range sits on the rim in their direction.
The ways into the minigames, the mine tours and COMBE DOWN WITH ME, are marked as points of
interest: a white star in a cyan ring on the minimap, the big map and the pub map (within 800 m the
minimap keeps it on its rim, pointing the way), and in the street the same marker over the door and
a ring of light on the step.
The cable car is on the minimap, the big map and the pub map too: a red and white line between its
two stations, with a cable car badge at each end.

To show everyone where to go, put a marker down: click or tap anywhere on the big map (with the
mouse captured, move the crosshair and click), or press G while looking at a spot. Each player has one marker, in their colour (yours is
yellow); putting it somewhere else moves it, and tapping it again on the big map (or pressing G
while looking at it) takes it down. Everyone in the game sees it as a pin on the minimap and the
big map, a tall column of light standing up from the spot in the street, and a pin on the compass
strip across the top of the screen with how far away it is. A marker behind you sits at the end of
the strip with an arrow saying which way to turn. It goes when its owner leaves.

**Play:** https://spencereholtaway.github.io/CombeDowner/

## Run it

```sh
cd web
npm install
npm run dev          # http://localhost:5173
```

Add `?net=local` to the URL to link tabs in one browser instead of using WebRTC (handy for testing).

## Publish

Every push to `main` builds the game and publishes it to GitHub Pages
(`.github/workflows/pages.yml`; Settings → Pages → Source: GitHub Actions).

## Rebuild a map

Combe Down and the rest of Bath are one map, built in full-detail squares about a kilometre
across (`tools/prep_tiles.py`, see docs/new-area.md). The village is the middle 3 x 3 of them,
built in the same run as the rest and then stitched into one file the game loads first
(`web/public/maps/combe-down.json`); the other squares are streamed in round the player. A lighter
whole-city file goes underneath, for the minimap and for anywhere a square isn't loaded:

Everything the map is built from is kept in the repository, in `data/combe-down/`
(`tools/mapdata.py`), so it rebuilds from a fresh clone with nothing to download, and comes out
byte for byte the map everyone else gets: the Overture, OpenStreetMap and food hygiene data, the
energy certificates (without addresses), the terrain tiles, and what the build measures from the
Environment Agency lidar and the tree canopy map (building heights, roofs and the canopy, square by
square), which are gigabytes themselves. It needs Python 3 with numpy, shapely and Pillow:

```sh
pip3 install numpy shapely pillow
MAP=combe-down
python3 -I tools/mapdata.py unpack $MAP        # the repository's copy -> data/raw/$MAP/wide
# the canal and the railways first: the squares cut the ground under the track and the canal to
# the levels these work out
python3 -I tools/canal.py $MAP data/raw/$MAP/wide web/public/maps/$MAP-canal.json
python3 -I tools/railway.py $MAP data/raw/$MAP/wide web/public/maps/$MAP-rail.json
python3 -I tools/prep_tiles.py $MAP data/raw/$MAP/wide web/public/maps/$MAP --force
python3 -I tools/prep_wide.py $MAP data/raw/$MAP/wide web/public/maps/$MAP-wide.json
python3 -I tools/pubs.py $MAP data/raw/$MAP/wide web/public/maps/$MAP-pubs.json
```

That takes about 5 minutes on four cores, and a second run only rebuilds the squares whose data or tools have changed. On GitHub, the "Rebuild the map" workflow (Actions tab, Run workflow) does the same across ten machines at once, commits the map files and redeploys the game. A change to the build tools is rebuilt the same way; a
change to what is measured from the lidar or the canopy (`tools/lidar.py`, `tools/canopy.py`,
`buildings.roof_parts`) needs the raw data, measured afresh. To fetch it all from the public
sources again (about 2.5 GB, plus the energy certificates by hand), measure it and pack it back
into `data/combe-down/`:

```sh
pip3 install overturemaps rasterio
python3 -I tools/fetch.py $MAP                  # -> data/raw/$MAP/wide (see the top of fetch.py)
python3 -I tools/canal.py $MAP data/raw/$MAP/wide web/public/maps/$MAP-canal.json
python3 -I tools/railway.py $MAP data/raw/$MAP/wide web/public/maps/$MAP-rail.json
python3 -I tools/prep_tiles.py $MAP data/raw/$MAP/wide web/public/maps/$MAP --force --measure
python3 -I tools/prep_wide.py $MAP data/raw/$MAP/wide web/public/maps/$MAP-wide.json --measure
python3 -I tools/pubs.py $MAP data/raw/$MAP/wide web/public/maps/$MAP-pubs.json
python3 -I tools/mapdata.py pack $MAP data/raw/$MAP/wide
```

With only the lidar and the canopy tile fetched (`tools/fetch.py $MAP --only lidar,canopy`, after
`mapdata.py unpack`), the same `--measure` builds measure afresh from the data already in the
repository. `data/combe-down/README.md` says where each part comes from and its licence.

A map with no wide area (Royal Victoria Park) is one file, built straight from its own downloads
with `python3 -I tools/prep_map.py $MAP data/raw/$MAP web/public/maps/$MAP.json`.

Each map's centre, size and local character areas are in `tools/area.py`. To make a map of a new
area, follow [docs/new-area.md](docs/new-area.md): every download, where it goes, the build, and
landmark packs.

## Single-file build

`python3 -I tools/build_single.py web out.html [map]` makes one self-contained HTML file with one
map inline (Combe Down unless you name another). It is solo practice only.

## Credits

Map data © OpenStreetMap contributors (Open Database Licence), Overture Maps Foundation,
Microsoft. Elevation and building heights contain Environment Agency data © Crown copyright (Open
Government Licence); terrain tiles by Mapzen (Amazon Terrain Tiles). Tree canopy from Meta and
World Resources Institute's High Resolution Canopy Height Maps (CC BY 4.0). Wall materials from
Energy Performance Certificate data (Open Government Licence) located with OS Open UPRN, which
contains OS data © Crown copyright and database right. Food hygiene ratings from the Food Standards
Agency (Open Government Licence). The copy of the map data in `data/` is shared under the same
terms (see `data/combe-down/README.md`).

### Building heights and roofs from lidar (optional)

With Environment Agency lidar, each building gets its real eaves height, ridge height and roof
shape (gabled, hipped or flat, and which way the ridge runs) instead of a guess from its area
(`tools/lidar.py`). Download the 1 m **LIDAR Composite DTM** and **LIDAR Composite First Return
DSM** from https://environment.data.gov.uk/survey for the OS squares the map covers (Combe Down:
ST76SE and ST76SW) and unzip the GeoTIFFs into the map's raw folder:

```sh
data/raw/combe-down/lidar/dtm/*.tif
data/raw/combe-down/lidar/dsm/*.tif
pip3 install rasterio
```

Buildings the survey doesn't show (newer than the flight) keep the rule-based guess.

### Tree canopy (optional)

Trees are placed from Meta / WRI's global canopy height map when a tile is present in
`data/raw/<map>/canopy/`. For this map that is the zoom-9 quadkey tile `031313120`:

```sh
mkdir -p data/raw/combe-down/canopy
curl -o data/raw/combe-down/canopy/031313120.tif \
  https://dataforgood-fb-data.s3.amazonaws.com/forests/v1/alsgedi_global_v6_float/chm/031313120.tif
pip3 install rasterio
```
