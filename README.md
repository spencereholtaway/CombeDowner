# Combe Downer

A multiplayer first-person shooter in the browser, set in Bath. The map is the whole city, 11 km
across inside a force field, built from real open data: Overture Maps buildings, roads, walls,
woods and water on Environment Agency lidar terrain. It starts in Combe Down, round the Hadley
Arms, and everything you can do there you can do anywhere in Bath.

**Play:** https://spencereholtaway.github.io/CombeDowner/

**Who's who:** https://spencereholtaway.github.io/CombeDowner/characters.html, everyone you meet on
the streets and down the mines, and every car, bus, train, balloon, boat and ride in their colours, on a turntable.

**What's what:** https://spencereholtaway.github.io/CombeDowner/whatswhat.html, the set pieces,
landmarks and vehicles, in full, without textures or as wireframes, and in AR on an iPhone or iPad.

It's paintball by default, peer to peer with no game server, and ships no images or sound files:
every texture, model and note of music is made in the browser.

## What's in it

The full guide is in [docs/playing.md](docs/playing.md). In short:

- **Bath, all of it**: streamed in around you in squares about a kilometre across, at the same
  detail everywhere. Landmarks are modelled by hand: Bath Abbey, Pulteney Bridge, the Roman Baths,
  Great Pulteney Street, the Holburne Museum, Prior Park, Sham Castle, the Bell Inn, Twerton Park
  and more. Every other church has its tower where it really has one, as tall as the lidar
  saw it, with battlements, and pinnacles and a spire where the lidar shows those too (St Stephen's
  on Lansdown, St Mary's Bathwick, St Michael's on Broad Street, St John's on South Parade). Every other bridge is built as its kind from OpenStreetMap: stone arches over the canal
  and the railway, steel lattice trusses at Midland Bridge, concrete beams on slim piers for the
  trunk roads, light footbridges with railings for the paths, and stone towers and chains for a
  suspension bridge, with the gap under each kept clear and the ground under it as low as the lidar
  saw it. Every deck is solid from parapet to parapet, however narrow the path along it, and the
  parapets run unbroken round its bends and where its pieces join, stopping only where another
  deck runs right alongside. A bridge over a road opens over all of it, both carriageways and their
  pavements, with no pier or wall standing in the road and an arch flattened to clear it, and the
  road runs on under it unbroken, for walking or driving under; a street with a junction on its deck is one bridge through it. The railway's own bridges are Bath stone: the viaduct through Bath Spa is a long arcade of
  round arches with voussoirs and a coping along the parapet, flatter arches where an opening is
  wide, and a steel girder on stone abutments only where no arch would clear the road or the river
  under it. A short bridge is all one or the other, and no pier stands in the way. You can walk the
  whole line without falling through it: along its viaducts, up its grassy embankments, and on to
  the platforms, which stand on a row of dark arches under a station on a viaduct, with the
  canopies the map data has over them on posts (not as blocks standing up from the street below).
  The stonework is textured in the area's own material: Bath stone in Bath, London stock brick in
  Hackney. Tracks running side by side over a viaduct share one deck at one height, on piers in
  line with each other's, and a line that passes under another has the headroom for a train.
  A railway tunnel's mouth is one stone face for the tracks going in side by side, under one arch
  or an arch each, and stands only as high as the hill it's cut into lets it; its bore is lined
  in stone, the track running in, until it fades to dark a few metres in. Walls the map draws
  across the cutting stop at the line, and no building, parked car, bench or path stands on a
  running line or inside a tunnel's mouth. A siding or a line the data ends stops at red buffers.
  Where the map
  data has a level crossing (the footpath over the main line at Ferry Lane, Bathampton, or Bridge
  Street at Greenland Mills in Bradford-on-Avon), the way crosses the line at grade on a deck between
  the rails, with red lights on posts either side; everywhere else a path stops at the line. A
  garden's miniature railway is left out rather than built as a full-size main line. A river steps
  down only at its weirs and dams, where the water falls over a stone crest into the water below
  (Twerton, Kelston, Saltford, Warleigh and Avoncliff weirs, and the dam below Prior Park's top
  lake), and a tank, a pool or a reservoir stands in concrete walls wherever its water is above the
  ground round it, as the filter beds do at the sewage works. You can wade into the water and walk
  along its bed: where it's deeper than you are tall (out in the sea off Cape Town's quays), the
  water closes over your head, murky green, with its surface above you. A road the map
  data puts in a tunnel goes through one, bored under the hill from where its road meets the hill
  face, with the ground and the lanes over it left as they are and one headwall over the
  openings where two bores come out side by side. A tunnel cars drive through is a modern
  concrete box, with square openings under a flat lintel, a pier between the bores and concrete
  wing walls, lorry-high inside, and nothing on the hill over it gets in the way of the traffic: the A46 runs under Bailbrook Lane through the Bailbrook Underpass.
  A path's tunnel, often an old railway's like the Two Tunnels, is a Victorian brick arch in a
  Bath stone face, about 3.6 m to the top, with a low band of stone over its arch. Each bore is as wide as the road or path going in, wall
  to wall, with its pavements carried through where it has them. The road runs level into each
  opening along a cutting dug to its floor, with wing walls holding up its sides where the hill
  beside it stands high or rises steeply, their copings sloping down the bank, with no tree or
  wood overhanging the portal, the way out in front of it or the cutting's steep sides, and a stream through a culvert goes in under the hill. Out of town a dual
  carriageway, its slip roads and the roundabout they meet have grass verges, not pavements, so
  each carriageway stands apart on the grass, and two roads meeting at different levels meet at a
  wall rather than in one slope of road.
  Open country is the ground the map data says it is, not lawn: bare grey rock with boulders, heath
  and scrub grown as low rounded shrubs, sand on the beaches and rushes in a marsh, from the map down to the
  minimap and the mountains on the skyline. The heath grows what grows wild there, from the
  ecoregion the map is in: on Table Mountain it's fynbos, half of it in flower in drifts of purple,
  pink, yellow and white; in England it's mostly green gorse, bramble and heather, with a little gorse
  yellow, heather purple and bramble white. Where England's fields would be forest left to
  themselves, the satellite's "scrub" is grazing and hedgerows, so it's drawn as meadow, and only the
  heath and scrub OpenStreetMap maps are heath. The grass and the trees belong there too: in
  Cape Town's summer-dry climate the meadows and verges are going to straw and a quarter of the
  trees are pines among olive and grey-green leaves, while England keeps its green fields,
  buttercups and daisies, and its broadleaves with the odd conifer and copper beech. South of the equator (Cape Town) the sun crosses the
  northern sky, so slopes facing north are the sunny ones. A whole day goes by every 24 minutes,
  and the game always opens, and every new game starts, at seven in the morning with the sun just
  up; everyone in a game sees the same time.
- **The streets as OpenStreetMap knows them**: zebra crossings with their stripes and Belisha
  beacons, crossings with lights (pelican, puffin and toucan) with studs, stop lines and lights at
  each kerb, and traffic lights at junctions; bus shelters only at the stops that have one, and the
  stops on a street closed to traffic that buses still use (Milsom Street, the University's
  Parade) at its kerb, with the bus you call driving along it; post
  boxes as they really stand (a pillar box, one set in a wall, or a little one on a post) and the
  red K6 telephone boxes where they are. Footpaths across fields are worn grass, bare earth or
  gravel where the map says so, not paving; drives and alleys are a single narrow lane with no
  pavement or parked cars; in front of a shop the pavement runs on up to its front, with no
  front garden, and a front door opens clear of any wall or fence, on a wall with open ground
  outside it (never a terrace's party wall or into a neighbour's extension); paths, twittens, towpaths and pedestrian streets turn at their real corners, so a
  dog-leg between gardens goes round them rather than through them; flights of steps are solid treads climbing between the ground at each
  end, turning at their landings, with handrails along them where the map has them. Mapped
  dry-stone walls, railings and wire fences are built as such, with crash barriers along the main
  roads, and where a footpath goes through a hedge, fence or wall you find its gate, stile or
  kissing gate (only where the boundary is really there), with cattle grids across the lanes.
- **The Flag Lads' flags** go up a streetful at a time: five to fifteen on neighbouring lamp posts
  along one road (on a pole of their own where a street has no lamp), so you find them by finding
  the right street. The big map and the minimap show each lot as a soft red blob about a street
  across, not a pin. There are never more than 200 flags up on the whole map, so the meter
  ("Flags up 27%") drops 1% for every two you shoot, straight away on your screen. New lots go up
  now and then, and ladder lads come to put shot flags back on their street. Get every last flag
  on the map down and a card says the place (Bath, Bradford-on-Avon, Hackney, Cape Town, by the
  map's own name) is safe from the Flag Lads, and they stay away for three days, kept over a reload
  and whoever's hosting. Every day from midnight GMT they start again with a few new lots.
- **Shooting the Flag Lads' flags** is a game of its own: flags shot within four seconds of each
  other build a combo ("x3!") with a rising note for each, and a tally when it ends. Shoot along a
  string of red and white bunting and the whole string flutters down for a bonus and rips the flags
  off the lamps at both ends, each counting as a flag you shot (so one string can start a combo).
  It's strung again once the ladder lads put those flags back. Shoot from a bus, a bike, a skateboard or mid-grind for a trick-shot
  callout, and shoot the last flag on a street for a bit of confetti and, when you're playing
  alone, a moment of slow-motion.
- **The Flag Lads have a brew while you're busy.** When everyone in the room is on a job, a race,
  the bonfire or any other minigame (alone, just you), the flags stop creeping and
  spreading, the ladder lads stay put, no new pub gets taken over and the clock on a takeover you
  haven't got to yet stands still. The flags meter keeps out of the way while you're on a job. If only some of you are busy it carries
  on so the others can defend, but nobody mid-job gets the phone call about a new takeover.
- **A pub takeover can be lost.** The Flag Lads fight at the pub's front, and lads on ladders hang a
  banner on it while a bar across the top of the screen fills (150 seconds alone, quicker with
  friends, with more lads up ladders). Fill it and the pub is theirs, and ten to fifteen flags go up
  on its street and the streets running into it; shoot a lad off a ladder and it drops back. You
  can't pick a pub that's being taken over on the big map and go straight there: get there yourself. At half health the Gaffer runs, on foot, on a scooter or in his van: catch him within
  400 m for a bonus, or he's tomorrow's Wanted poster.
- **Wanted: catch him and cuff him.** One man, marked on everyone's map and compass, doing his round
  of a pub, a park and a bus stop with a few mates who'll have a go at you. Get close and he legs it, quicker than
  you can sprint, but he's out of puff every few seconds (his puff is the bar across the top of the
  screen), and a paintball hit winds him. Get right up to him and press E (the pad's use button, or
  Use on a touch screen) to cuff him. Fall 80 m behind for a few seconds, or let a chase go past two
  minutes, and he's got away to his next stop: three goes, shown on the job card and the poster, and
  the third time he's gone for good. Quarter of an hour on the clock. More players and he's
  quicker, warier and has more mates. A Gaffer who got away is a Wanted poster too, and quicker
  still if he left on his scooter or in his van. J (hold the pad's touchpad, or Poster on a touch
  screen) brings his brief back with his round of stops on it, and it ends on the result card in the
  poster's red.
- **Jobs** on noticeboards round town, a fresh set every day: win pubs back from the Flag Lads,
  hunt Wanted ringleaders, race across town and fight off Seagull Attack.
  A job done well can lead on to another, so an evening has a shape: a pub won back, and its landlord
  says last one to the next pub buys (a race from his door); the Gaffer cuffed, and his phone gives
  away the street the Flag Lads are eyeing next; Seagull Attack won, and a tourist tips you off about a ladder crew. Ignore any of them
  and it lapses in a minute or so. After three things done, everyone is called to one pub for last
  orders, and when the whole room is at the bar the night's front page comes up.
  Every job and team challenge starts the same way, as a race always has: taking one opens the
  entries, and for 15 seconds anyone in the game, wherever they are (even in a car), can press E
  (□ on a pad, Use on a touch screen) to join in, with a big banner saying who's in and counting
  down. On your own in the room it goes straight to the start. When the entries close, everyone
  who joined, and nobody else, is taken out of whatever they were doing (out of a car, a balloon or a
  trolley, off a ladder or their ride, anything carried put down), patched up to full health and put
  in the game area, spread out and facing the way, and held still for the title card. A 3, 2, 1, GO!
  comes only when more than one of you start together at one moment: under start lights for a race,
  a plain count in the job's colour for anything against the clock. On your own there's no count,
  and a calm job (the gallery, the test challenge) never has one. Anyone who didn't join, or turns up later, is left where they are and can
  watch. Races put the entrants on a grid in the street on the race's ride,
  run through checkpoints along a route drawn on the map (racing with others, the panel shows your
  place in big figures, 2nd / 5, as it changes, and how far you are behind the one ahead), and end with a results
  card: your place, time and medal, your best, how the run went and everyone's standings, with a
  fanfare. Killed on the way, you're out of the race. Over the line or out of it while others still
  ride, you wait where you stopped, safe, and watch them (Q/E, the d-pad or the arrows on a touch
  screen switch who); everyone gets the results together at the end. Every job,
  race and the bonfire shares one set of screens: a title card with the goal when it starts, a panel
  with the goal and your progress all the way through, a banner for each wave, clue or checkpoint,
  and a card at the end that is a party for a win and a quiet one for a loss. None take a click.
 Every ride is faster in a race, boost pads lie along the route (two or three between checkpoints), and riding close behind
  someone gives you a slipstream. A big clock counts down to the next checkpoint, carrying what's left
  over, and goes amber with a beep when it's getting short; run it out and you're out of the medals but can
  still ride on to the line for your time. Alone, a faint gold-pace rider sets off from the grid with you. Barge into another racer hard
  enough and they come off. The shopping trolley and the skateboard are only raced downhill.
  Seagull Attack sets a ring of benches out on the nearest open ground (a green, a square, a wide
  pavement; if it's tight by the board, the board says where) and puts everyone who joined in the middle of it.
  Each tourist has a pin over them that shows through anything, green to red as their sandwich goes
  and flashing while a gull's after it, and the ring is on the maps. The tourists point out gulls coming
  in, wave their arms at one after their lunch, duck, cheer a good shot and storm off in a huff,
  saying so. Each kind of gull has its own look, every wave comes in from one side under a banner
  saying what's in it and from where, and before every wave each player gets an ammo pack.
- **Losing leaves a scar** for the rest of the day, each a little rematch (a grey ! on the map). A pub
  the Flag Lads keep hangs their "WE RUN THIS" banner high up, guarded by lads: shoot every cable tie
  and it drops. A race
  nobody finished leaves a smug ghost: press E on the line and reach the last gate before it does. A
  Wanted man's tag is sprayed over (hold fire, or the touch fire button, with the crosshair on it)
  till 90% is covered. Bigger rooms get more to do: more ties, gates and tag, and
  tougher guards. Put one right for a prize.
- **Dive**: go prone (Z, or hold Circle) mid-sprint and you dive forward as in Call of Duty, landing
  flat with a thud and a moment to get your breath back. Down the mines, crouch mid-sprint to dive.
- **Getting about**: bikes, boards, trolleys and a pogo stick with tricks and grinds (Shift on a kerb or
  low wall to grind; the way you hold the stick picks the grind, so a skateboard does 50-50, nosegrind,
  5-0, boardslide and lipslide, and each ride has its own names; Space pops you off, Shift in the air
  catches the next one, and a long grind wobbles: tap the opposite way to steady it. On every ride and in
  every vehicle A and D (or the left stick) steer and the mouse only looks about, swinging back to the
  way you're going as soon as you leave it be or speed up; come off and you're back on the way the ride
  was pointing, never where you were looking. On a ride a tap of A or D is a nudge of a few degrees
  and holding it builds to full lock; a stick pushed forward with a little lean goes straight, and
  steers once it's clearly over. In the air only a hard turn spins you, and you snap on to a grind by
  yourself only off a jump of your own lined up with the edge (Shift catches one at more of an angle). Grinds, jumps and
  air tricks chain into one combo with a multiplier, best kept for each ride), ladders up
  any wall, cars to drive (a red-ringed sign by the speedo shows the street's speed limit, the real
  one from OpenStreetMap: most of Bath is 20 mph, the main roads out 30 to 60; C goes round the chase camera, the driver's seat and a racing game's bonnet camera; at speed the tyres grip and let go like a driving game's: Space at speed with some lock on swings the back end out into a slide, the throttle holds it in a rear-drive car, hold it too long and it spins, and steering the other way catches it, with a wag of the tail as it grips again; a bus or a coach just leans on its tyres and turns, and at a crawl Space and the lock still do donuts), buses to call, narrowboats and working locks on the canal (and marinas full of moored boats, where the survey saw them), a cable car (in through a passage in the engine house at the back of each station, up steps where the platform stands above the ground),
  hot air balloons at dawn, and trains, one of which takes you down the valley to Bradford-on-Avon (whose force field takes in
  the town and the fields round it, down Trowbridge Road past the canal bridge at Widbrook to the marina; it opens its doors on the platform side; the others stop with them shut, "Not in service" on the boards). Every pub has a pint on the big map (M), faint till you zoom in: point at one for its name, how far it is and its food hygiene rating, and click or tap it for a card that goes there or marks it, any of about a hundred. A pub with a job or a bus stop on top of it has its pint moved out beside it, with a thin line back, so you can pick either. Go to a pub, in the pause menu, opens the same map with the pints picked out. You can't use a pub to get out of trouble: not with anything after you within 40 m (naughty boys, the posh teams, Flag Lads, cats, Bendy), within 10 seconds of trading shots with another player, or 5 of being hurt, and the card says what's stopping you. Nor can you go straight to a pub the Flag Lads are taking over. In a race or a challenge, or fighting a pub takeover, it asks whether you want to leave it first (with others in a race or a challenge, you see it through or call it off from the pause menu).
- **Trouble**: naughty boys, cat swarms, Bendy after dark, and paintball (or `?gore=1`) for
  everyone else. Paint splats stay on whoever you hit, and go where they go. The rifle's balls lob
  out of a hopper you refill from a pod; the sniper fires finned First Strike rounds from a clear
  magazine, flat and fast, with a sharper crack and a tighter splat.
- **Recent rooms.** The start screen lists the games you were last in (up to 8, newest first) with the map, how long ago and who was with you, and a "news" tag if that room has an unread Chronicle page. Tap one to go back to it; × forgets it. It's kept in your browser only, and can't say who is in a room now.
- **A room is a save.** The strange objects, the sockets filled (so the zones and challenges open), the challenges won and the bonfire pile belong to the room you play them in. A new room name starts from nothing; go back to an old one and it carries on, from whoever in it has got furthest. Each room on the recent list says how far it's got ("3 of 6 zones open, 10 sockets filled, 1 challenge done"), and Practice solo is a save of its own on each map, listed there too once you've played it. Your name, look, settings, bests, trophies and the daily jobs are yours in every room.
- **Link a device** (on the start screen) carries all of that to another phone or computer: show a code on one, type it on the other, say yes on both, and each ends up with everything either had (each room keeps whichever got furthest), with the name, look and settings of the one that showed the code. If the two can't both be online, Copy save as text on one and Paste a save on the other.
- **Build label.** The foot of the start screen (and the note that comes up if the map stops loading) says which build the page is, so you can tell if you're on an old one.
- **Always there**: climb Bath Abbey for the angel's wings (or type HEAVEN), stand on anything 15 m above the ground round it (a roof, a tower, a high wall) for a wingsuit to keep (or type SQUIRREL; type CHEATS for them all), then jump off and press Space in mid-air to fly it (A and D bank round, W dives, S pulls up, the mouse looks and shoots freely; the others see you spread out flying), take penalties (against the computer's keeper, or a shoot-out with friends in goal) and kicks on any pitch,
  build Kingswood's bonfire for a night of fireworks (with prefects on your back), and earn daft
  things to wear in the wardrobe. And somewhere along the bottom of Royal Victoria Park, follow the guitars to a car that
  someone's left with the door open and a tape going.
- **The wardrobe** (pause menu): 37 daft things to wear, one on your head, one on your face and one
  on your back or shoulder, each in its own tab with what's still to earn and how. Everyone you play
  with sees what you've got on. They come from all over: a seagull for three stars on a Seagull
  Attack, a chef's hat from the Darling Deli, a crown for being there when the whole map opens, a
  party hat for setting the last strange object in a structure (and a strange object of your own on
  your shoulder after five), a bus driver's cap for a clean shift on the buses, a clippie's ticket
  machine hat for fifty tickets sold in Push the Bus (a pensioner's rain hood for gold with them all
  happy, a walking stick for being hit by one, a thermos in a string bag for being hit by the lot),
  earmuffs for a clean touch on the bells, a beret when the critics call your show a triumph, a
  lock-keeper's cap for gold on the Lock Run, an L-plate for passing the driving test, dazzled eyes
  for 60 km/h past a speed trap, goggles for ending up in the water ten times, a mouth guard for a
  shoot-out won, a froth moustache for ten different pubs, a monocle for a night out seen through,
  sunblock stripes for knocking over the stumps, climbing rope for topping the Climb with no lives
  lost, a balancing pole for the Tightrope, a miner's lamp for the bottom of the mines, a skateboard
  for a ×10 combo and a pigeon for an hour in the parks. They work the same on every map.
- **Trophies**: bronze, silver and gold for every kind of job (finish one, then a three-star or silver
  time, then gold), and daft milestones for riding, fighting, pubs, landmarks and wandering about Bath. A
  "Trophy!" slides in when you win one (or is listed on the result card, if a job has just ended). The pause menu's Trophies cabinet lists them all by category and
  gives your Bath completion %: trophies, landmarks, pubs, map squares, rides tried and wardrobe items.
  A job's start card shows your best at it. All kept on your device.
- **Every job, race, challenge and shift ends on the same result card**: a cutting from the Chronicle
  with the job's own headline, your time or score, and everything you won listed on it (prizes,
  wardrobe items, trophies, a strange object). Space carries on, E goes again where you can, and it
  goes by itself after 8 seconds. Notices queue rather than vanish, and the use prompt draws each key
  as a key cap you can tap on a touch screen.
- **A job's brief is one cutting from the paper**: what you read at the noticeboard (whose foot says
  what E does, with no second prompt on top of it) is the title card when it starts, and J (or Poster
  on a touch screen) brings it back during any job with how it's going written on it. A ride's
  tricks and a string of the Flag Lads' flags build one combo, a single row under the crosshair
  (both at once when you shoot flags from a board), with the wings' flight in the same slot. Every message
  has one place by the question it answers: what to do now is a strip under the crosshair, drawn
  like the use prompt; what just happened is a plate a little above the middle; how your job is
  going is the job's own brief, panel and stage calls in its colour; your score is the combo row
  under the crosshair; what you've earned to keep is a gold-edged plate at the top (a new wardrobe
  item shows a little picture of it), or a line on the result card when one is up; and who's
  about is the feed, top right. The big map's
  key, its notes and a pub's card are BathText pages like the menus, and the game's notes about
  itself (the map stuck loading, someone on another version) are a BathText strip along the top.
- **Still being tried out**: the strange objects, the zones and the team challenges below are switched
  off on this site for now, so here the whole map is open, every way to get about runs from the start,
  and none of the three shows anywhere. Tick Progression in Settings (Play) to try them, and it's kept
  for next time; in a game with others, the host's say counts for the room. They're on to start with at
  danturn.github.io/CombeDowner and on a copy run locally. `?progression=1` or `0` in the address
  switches them for one visit.
- **Something strange**: win a pub back, do a job to gold or three stars, or win a team challenge,
  and an odd, softly glowing lump turns up on the spot. Carry it by hand (it fills your hands like a
  ride or a ladder, and you can't sprint with it; X puts it down, and if you're downed it drops for
  anyone to pick up) to the dark stack of frames standing on open ground in your zone (Firs Field in
  Combe Down), and E sets it in a socket. The stack is solid, and nothing else (noticeboards, races,
  spawns) is put down right by it. Filled sockets glow. Both maps mark every structure in the zones
  open so far, green once it's full and red while it wants filling; the one taking objects now pulses,
  and the minimap's rim points to it from anywhere with how far it is. Point at one on the big map for
  where it is and how full ("Structure, Firs Field (Combe Down): full"), and carry an object to a full one and
  it tells you where the next one is and which way. The room carries on from whoever has got furthest
  in that room.
- **Zones**: the map opens a part at a time. You start in a small first zone to learn the game in (in
  Bath, the middle of Combe Down), with a pub, places for jobs, a main road and a structure that needs
  only two objects, and a shimmering wall like the force field's round it. The town's busiest streets
  (in Bath, the city centre from Bath Spa up to the Royal Crescent) are always the last zone, and the
  rest open in a sweep round them; where a map starts you in its centre, you start just outside it instead. Each zone has its own structure and a challenge or two, each marked on both maps
  with a big glowing question mark that the minimap's rim points to from anywhere; fill a structure's
  sockets and the wall moves out to take in the next zone, with a fly-over of it, its name, its
  challenge and any new way to get about, its card landing with a fanfare, a cheer and a shower of
  confetti (a bigger one still when the last zone opens). Buses, bus routes, canal boats, balloons,
  trains and the cable car open up with the zone they're in, from the second on (before then a bus
  stop says "No buses out this way yet"), and none of them takes you past the wall. Bath and Cape
  Town have six zones and Bradford-on-Avon three. Tick
  "Explore all of the map (no zones)" on the menu to have the whole map open: the host's choice counts
  for the room.
- **Team challenges** have no noticeboard: the thing itself waits at its place, with its badge on the
  maps to find it by, and walking up to it shows what it is and E (Use) starts it for the room.
- **The Lock Run** (a team challenge, on any map with a flight of two or more canal locks: in Bath,
  Widcombe's six down to the river): the laden boat lies moored above the top lock till you start.
  Take a narrowboat loaded with barrels from above the top lock to
  below the bottom one, working every lock by hand. No clock: the trouble is the water and each other.
  Lean on a balance beam (E) and walk it round: two of you swing a pair of gates in a few seconds, one
  alone takes half a minute, and they won't budge until the water's level both sides. Wind a paddle
  up with a windlass, a notch a press (E), and there are only one or two windlasses to go round; take
  yours off once it's up, because one left on a raised paddle with nobody by it slips, the paddle
  crashes down and the windlass spins off, clouts anyone near and may end up in the cut. E on a
  paddle with no windlass on drops it. The steerer works the engine from the back deck (E: ahead,
  stop, astern) and she coasts a long way. The stone cill under the top gates reaches into the
  chamber, marked by a white line on the coping that the steerer can't see: the crew can, so shout.
  Empty a lock with her stern over it and she hangs there, the bow goes down, she slowly stands on
  end and the barrels and anyone on deck slide off; get the water back in quick or she sinks, and
  it's back to the top. Wind the top paddles up too far while the chamber's low and the surge throws
  her into the gates ahead and everyone on deck goes flat. Leave a bottom paddle up while filling and
  the lock never fills. Stand in the way of a beam as it swings and you're in the cut. The water
  between the locks is only what's there: waste it and the boat sits on the mud until you run water
  down through the lock above. Barrels lost make a worse result. With four or more of you a second
  boat comes up the flight the other way, sharing the water and the locks.
- **Push the Bus** (a team challenge): a Badgerline bus has broken down at the bottom of the
  steepest stretch of street on the map, 100 to 200 metres of it (in Bath, Perrymead, Hodshill,
  Rosemount Lane and the like; Whiteheads Lane in Bradford-on-Avon; Longmarket Street in Cape Town),
  and it has to be pushed to the top. It stands
  there all day, pulled in at the kerb a little way up from the bottom of that day's hill, hazards
  blinking, engine hatch up and steaming, a warning triangle in the road behind: walk up to it and E
  to start. E (Use) at its back puts your hands to it, and the view eases out behind you so you see
  yourself bent to it with your mates and the bus going up the hill; you go with it, looking about as you like, till you press E
  again or step back (S). Every couple of seconds the screen counts "One... Two... HEAVE!", with a dot
  sweeping across a bar to the moment: press Space (Jump on a pad, the Heave button on a touch screen)
  on it for a surge, or shout "HEAVE!" into your mic. The bar shows how close you need to be: dead
  on, in the thin green band, is PERFECT! and shoves it on hard; in the yellow is Good; in the orange,
  a bit early or late, it's scrappy and does hardly anything; and further off you've missed, lose your
  grip for a moment and it drops back. A shout gets a little more leeway than a press. Heaving
  together counts for more the better you each time it: a beat you all get perfect is PERFECT
  TOGETHER! and a big extra shove, while a beat most of you botch lets it slip back. Steady shoving soon tires,
  so stop heaving and it slows, stops and starts rolling back, faster and faster, until it gets away
  from you. Time it to the bar: the pips are a help, but come late through some headphones. On your
  own that's all there is to it. With two or more, someone can climb into the cab (E at the front):
  only they can see how fast it's going and what's coming down the hill (a car, the next bus stop),
  so they have to call it out. They steer off the kerb (A and D, or the stick) and pull the
  handbrake (Space, or Jump) to hold it while the pushers get their breath back, but held too long it
  smokes and slips, and letting it off right on a HEAVE! gets it straight on up. With three or more,
  one pusher can take the call (use, on the bus, or shout HEAVE three beats running; stepping back lets go): then the
  heave is whenever they heave, a bit quicker or slower as they like, and everyone else heaves with
  them, till they stop and the game counts again. Pull in for the cars coming down; a parked car in
  its way gets shoved aside. There are bus stops up the hill (two or three, a red flag on a pole),
  each with a queue of pensioners waiting for this very bus. As the front door comes up to a stop
  and the bus slows, the queue shuffles over: someone lets go of the bus, goes to the front door
  and presses E to sell the tickets, while the rest hold the bus (on your own it's chocked while you
  sell). Each pensioner counts out the fare a coin at a time: press E when it's exactly right, as
  the money goes green. Too soon and they start counting again; too late and they want change. Each
  one aboard adds a little weight. Push past a stop without selling a ticket and that queue is left
  shaking its sticks at you, and a letter about it turns up in the next day's Chronicle. Everyone
  aboard gets crosser while the bus is slow or rolling back: they lean out of the windows and shout
  ("I fought in the war for this!", "I can see your bottom!"), and the furious ones ring the bell
  (the cab is told they want the next stop, and not stopping there makes the queues further up
  crosser), throw a handbag, a walking stick, sherbet lemons or a thermos at a pusher (it splats
  your screen and puts your next heave off by a grade), get off in a huff and walk up the hill
  quicker than the bus, or start a row about the front seat that rocks the bus and takes the edge
  off the heaves. Keep it going well and they cheer ("Come on, lads!"), which widens the perfect
  window for the next heave, and now and then a feisty one gets off and helps push. At the top the
  result card gives your time and a grade from it and how happy the passengers are (anyone left at
  a stop or gone off in a huff counts as unhappy), so a team that ignores the stops does worse. Let it roll back past
  where it started and it's lost: off it careers backwards on its own, through the bins, the
  traffic and the parked cars and over anyone in its way, till a wall or a car stops it (or the
  water), and there it sits with its hazards going for a few minutes. On your own or two it's the
  minibus (lighter on your own); three or more get the double-decker, and it's heavier with every
  hand. Harder days pick the steepest hill.
- **The Balloon Tightrope** (a team challenge, opened by the strange structure): two hot air
  balloons stand ready on the grass of the biggest park on the map (Royal Victoria Park in Bath),
  a rope slung between their baskets, till you start. Then they go up 55 to 70 m and everyone else
  walks across the rope, one at a time, while the rest watch from
  beside the walker (E to watch from the basket instead). A and D (or the stick) lean you against a
  sway that builds as you go, gusts shove you (you hear them coming), W edges you forward, and
  standing still steadies you a bit. Lean too far and you're off: a long, screaming tumble into the
  grass, unhurt. The team shares its lives, hearts on the card (three, and one more for every two
  walkers past the first): a fall costs one, with a sad trombone for everyone, and the faller goes
  back to the first basket to try again after the others. Lose the last one and the balloons come
  down and it all starts again from scratch. One player flies
  each balloon with W and S (pull in, let out) to keep the rope just right: too far apart and it
  snaps taut and shakes, too close and it sags and wobbles. With two of you, one flies and the crew
  hold the other balloon; on your own, the crew fly both. The more of you there are, the longer
  the rope, the higher you go and the gustier the wind.
- **The Climb** (a team challenge): it waits at the foot of the tallest crag in its zone (on
  Signal Hill in Cape Town; where there's no crag, the tallest building, as by the Royal United
  Hospital in Bath and in Bradford-on-Avon), with a big orange flag on top, a rope hanging down one
  side and crash mats and a bucket of chalk at the foot. Take it on there and everyone who joins
  is lifted up to a crag of its own, a great buttress of honey-coloured limestone standing out of a
  drifting sea of cloud, with heaps of cumulus all round, the same on every map (the street's place
  names and minimap are put away while you're up there); E at the foot on the street takes anyone else up later, and
  the stile in the wall at the front of the grass under it (E) is the way back down. Its way up is
  made for a team: an easy slab to a ledge big enough for everyone, a blank wall whose first hold
  is out of reach alone, a little ledge out to the left, a traverse across to the right, out under
  an overhang and over its lip, up a chimney to a terrace, and the headwall to the top, where the
  whole team has to stand together to win (the team is whoever's up at the crag, so nobody left in
  town holds it up). Walk into the face (or E) to grab a hold; then the keys or the stick reach for
  the next hold that way, Space lunges for one further off and C lets go. The holds are laid out
  as routes, a reach apart, with a hard bit of longer reaches on each stretch. Your grip drains as
  you hang and climb (more on a long reach) and comes back on a ledge, or hanging off one of the
  big white jugs partway up the long stretches. The big orange holds are out of reach from their
  ledge: a mate crouches and you stand on their shoulders. On a ledge, E reaches down to haul up a
  mate below, and the first one up drops a rope for the rest. A short fall hurts your grip till
  you've rested; a big one knocks you out where you land, and a mate has to come down, pick you up
  (E) and carry you back up to the team's ledge in time, or you're out, a ghost, till someone drops
  a rope from the next ledge. The team shares its lives, hearts on the card (three, and one more
  for every two climbers past the first), and every fall that hurts costs one. Run out, or all be
  down at once, and it's back to the bottom with a fail card. Alone there are more holds and jugs,
  shorter hard bits and none needs a boost; with more of you there are fewer, and more that do. Win it and
  you're all back down on the street, where the strange object is left at the foot.
- **Bell Ringing** (a team challenge): outside the biggest church near where you start, a sandwich
  board says "Try bell ringing today" and the vicar stands by it beckoning you over. E by him starts
  it, and at GO everyone who joined climbs the tower to the ringing chamber, a rope each. It starts in rounds, then the method moves the
  bells about every row: Plain Hunt on an easy day, Plain Bob or Grandsire on a hard one, and the more
  of you, the more bells (up to eight) and the longer the touch. Pull (Space, ✕, or Pull on a touch
  screen) for your bell's turn in each row: a bell sounds a moment after you pull, so pull ahead of
  it, as the blue line and the sally gauge on the right show. Early or late clashes, and a late rope
  hauls you off your feet. Two bad rows running and it collapses into a jangle; too many over the
  touch and the conductor calls Stand. With fewer than three of you, steady old ringers make up three
  bells, and anyone who climbs up late stands by the wall and watches.
- **The Driving Test** (a team challenge, on any map with a car park on a decent road): a learner
  car with L plates and a roof sign waits outside the test centre (on London Road East in Bath), the
  examiner stood by it with his clipboard. E by them starts it; whoever gets in the driver's seat
  takes the test, he sits beside them, and two more can ride in the back. He gives directions as you
  go round a loop of the real streets near the centre, a few minutes long ("At the end of the road,
  turn left", "Take the second road on the right"), and marks you as a real examiner would: fifteen
  minor faults is still a pass, and one serious or dangerous fault fails you on the spot (he stamps on
  his brake, says nothing for a moment, then "I'm afraid that's a fail"). He watches your signals at
  every turn (← and →, or the arrow buttons), your speed against each street's real limit (the one on
  the sign by the speedo), whether you stop at the
  end of a road, the kerb and which side of the road you're on, and reminds you about your mirrors
  if you don't look round (the mouse or the stick), though he doesn't mark you down for it. Hit anything and that's that. The same minor
  fault four times over is a serious one. He'll ask you to pull up on the left on the way round and
  back at the centre, and how close to the kerb you get counts, and somewhere along the way he slaps
  the dashboard and shouts "Stop!". A test report comes up at the end with every fault on it. In the
  back you can turn the radio up or down (K and J) or change the station (I), wind the window down
  (U) or pull the handbrake (Space); on a pad the d-pad does the radio, station and window; or use the buttons on the screen: the handbrake skids the car,
  and he throws whoever pulled it out to walk, and the driver's test carries on. Too much din (the
  radio, or real noise on the back seats' mics) and he tells you to keep it down; the third
  telling-off is a minor fault for the driver. He hears the driver laughing or shouting too, and
  notices if they've gone quiet for ages. One pass in
  the room wins it, and anyone else can have a go afterwards by swapping seats; there are three
  tests a day (more with a bigger room).
- **The Art Gallery** (a team challenge, at a museum or gallery the map knows of, such as the
  Holburne, or failing that a big public building near a pedestrian street): an easel on the
  pavement says the Open Exhibition is tonight, and the curator stands by it beckoning. E by him
  starts it, and at GO everyone who joined goes straight up into the gallery (anyone else goes in
  with E by him when they get there), a long white room, lit the same day or night, with an easel
  each; once everyone who joined is in (or E to get
  on with it) the subject is set ("A seagull's revenge", "Last orders at" the nearest pub, "The night
  bus home") and so are tonight's two critics, each with a taste of their own that's worth reading
  first (three critics for a show of four or more). Each of you paints in an old-fashioned paint
  program for a minute and a half: pencil, brush, airbrush, fill, line, rectangle, ellipse, eraser and
  colour picker, four sizes, sixteen colours (left click for the first, right click for the second),
  Undo (Ctrl+Z), Clear and Hang it!, with the mouse or a finger; Esc steps back and E goes back to the
  easel. The paintings go up in gilt frames with a card each, under wraps until the doors open, when
  each one plays back how it was painted, a time-lapse of about eight seconds on its own canvas, before
  it settles. In come the critics and a crowd of
  the public (a nan, a builder, an art student, a seven-year-old, a Flag Lad, someone from the
  Council, a Roman re-enactor, a seagull...), who stop at each painting and say what they make of it,
  with a mark out of ten, in speech bubbles and out loud. They notice how much of the canvas you
  covered, the colours, scribbling, detail, symmetry, a sky over grass, whether you painted the
  subject at all and how much effort went in. They also recognise what you drew: a sun, a bus,
  a cat, a face, gulls, houses, trees, a stick figure, writing (draw the subject's own thing and it
  counts towards being on the subject). And yes, the rude doodles: the critics have seen it all
  before, your nan hasn't got her glasses on, and the Roman approves. They notice where the picture's
  weight sits, a horizon, empty space, clashing or calm colours, mud, black outlines, hatching, ruled
  or wobbly lines, how long you took and how often you pressed Undo, and two paintings that look
  suspiciously alike. The critics also bring their glasses: a picture-recognising model that runs on
  the host's own screen and can make out hundreds of things (dogs, castles, pints, the Abbey, the
  Royal Crescent, a snowman...) and how well each painting fits the subject. It downloads (about
  70 MB, once; the browser keeps it) while you paint, and the host's panel says how far it's got
  ("The critics are finding their glasses: 40%"). If it isn't there when the paintings are hung the
  critics wait for it a few seconds ("still arriving"), then go round without it, and a browser that
  can't run it never notices. Add `?critics=plain` to the address to leave it at home. Each has their
  likes: one critic loves a blank
  canvas, another wants every square inch working, but everyone knows good work when they see it: a
  careful painting of the subject that fills the canvas, ground first, with the time taken, gets 8s
  and 9s and a 10 from someone, a half-done or wrongly coloured one about 6, and a blob or a scribble
  2 to 4. They watch the time-lapse too, and a painting that started as a cat and ended as a bus, or
  had something rude painted out, gets talked about. The critics' marks count double. Walk round while
  they talk, and E by someone else's painting votes for it: the room's favourite gets half a mark.
  Prizes go to the best in show, the critics' pick, the public's favourite and the most divisive
  (with a couple more for anything cheeky, none of them for restraint), and
  if the show averages enough it's a success and one of the strange objects turns up at the door. The
  critics confer for a moment, then the verdict comes up on a card: put it away (E, Esc, a click or a
  tap) and stay to look round, with the marks and rosettes on the cards by the paintings. Leave by the
  exit or with E by Mr Pettigrew, the curator, inside it, or stay until the gallery closes (a minute
  and a half, counted down on your card), and you're back on the pavement outside, looking at the
  door. The more of you there are, the more paintings there are to carry and the higher the bar.
- **The maps**: the minimap in the corner is for right now: you, your mates, map markers, the job
  you're on, challenges on its rim, and Bendy close by. M opens the big map
  for planning, with the mouse free as an ordinary pointer: click to mark, drag to move it, the wheel
  to zoom round the pointer, WASD to slide it along, Space or Find me to come back to yourself, M or
  Esc to close. Point at anything for its name. It shows everything at every zoom: the zones,
  challenges, players, markers, jobs, speed traps, minigames and bus stops, with jobs right on top of
  each other drawn as one badge with a count; the jobs' names come in as you zoom in. Pickups and
  rides are off both maps to start with (the key switches them back on). On a touch screen drag,
  pinch and tap; with a controller the left stick moves a cursor that slows over things on the map,
  R2/L2 or the right stick zoom, A marks and B closes.
- **Map markers**: click the big map or press G (or the middle mouse button) at something to put your marker there; everyone sees
  it. Click (or tap) anything drawn on the big map, a job, a challenge, a race's start or next
  checkpoint, a minigame, a strange structure, a bus stop or a cable car station, and the
  marker goes exactly on it and says what it is ("Dan marked Push the Bus"); a pub opens its card,
  with Mark it on it; clicking a bunch of jobs
  zooms in on them. In the street a marker on something is a ring of light that fits round that
  thing, so you can see what was picked when you get there. Each player's markers and arrow are in
  their own colour on the maps, never one the maps use for something else; click your marker, or the
  thing it's on, again to take it down.
- **What's yours**: the big map (M) shows a small pint on each pub you've won back and a thin
  amber ring where a scar's waiting, under the Flag Lads' red. A line in the map's corner says how
  many of their flags you've shot and pubs you've won back. "What's yours" in the map's key switches
  it off. It's kept on your device from day to day.
- **The Chronicle**: the game's newspaper, named after the map you're on ("The Combe Down
  Chronicle"), as one big front page with no tabs. Down the main column are today's three jobs and
  how the Flag Lads are doing, then "Yesterday in ...": yesterday's lead story with its photo (the
  closest finish at a pub, the quickest win, the worst loss), written from what happened in your
  game the day before. The side column has what's still scarred, a flag league if you had company
  (your own numbers if not) and Gaffer watch for today's Gaffer; a few small items run along the
  bottom. It comes up when you join (once a day, for about 20 seconds, or tap it away) and under Tab
  (or pause, on a touch screen), where the league table is printed across the top of the page. It's also on every noticeboard (N, or tap Read the Chronicle) and
  in the pause menu, where Read the Chronicle opens it on its own sheet over the menu: Esc or its ×
  puts it away and you're back at the menu. On a phone it stacks into one column and
  scrolls. Players who play together get the same story; your first day, it's the Flag Lads
  arriving.
- **Under Combe Down**, a co-op dungeon crawl in the stone mines (`web/mines.html`), and
  **COMBE DOWN WITH ME**, a co-op cooking game in the Darling Deli (`web/deli.html`). Both have a
  door in the street.

- **E uses what you're looking at**: with two things in reach at once (a strange object by a
  noticeboard, a ladder by a car), E (or Use) goes for the one under the crosshair, or the nearest
  when you're looking at neither, and the prompt always says which, with "or look at…" for the
  other. Whatever you're in or on (a car, a basket, a boat's tiller), or a job's own use like
  cuffing someone, still comes first.

- **Play with a game controller**: a PS5 pad over Bluetooth, an Xbox pad or any other the browser
  knows, and the game says when it sees one. Left stick walks (click L3 to sprint), right stick looks, R2 shoots and L2 aims; the
  buttons follow Call of Duty: Warzone's defaults: Cross jumps, Square reloads on a tap and uses on a
  hold (a tap uses when there's a prompt), Circle crouches on a tap and lies down on a hold,
  Triangle switches weapon, L1 and R1 go back and forward through them. In a car R2 and L2 are the
  pedals, the left stick steers, Triangle gets out and R1 is the horn. Options pauses, and on the menus the
  d-pad moves, Cross presses and Circle goes back. Settings has the pad's look speeds, invert
  (up and down, and left and right), dead zone and rumble once one's connected, and you can move any button to another in Settings,
  Controller, Buttons. While you play with the pad, prompts name its buttons rather than keys. The full list is in
  [docs/playing.md](docs/playing.md#game-controllers). It works down the mines too.
- **Arriving somewhere new**: when you start a game, come back to life, go to a pub (or anywhere
  else across the map) or step off the train in another town, the street's name sign covers the
  view until the streets round you are built, so you don't watch them go up. It lifts as soon as
  they are, after half a second at the least and 9 seconds at the most, so a slow phone isn't kept
  waiting. While it's up you can't move or shoot, and nothing can hurt you. A jump to somewhere
  that's already built isn't covered at all.
- **If the map won't come in**: after half a minute with nothing new, a note at the top says how
  many squares of Bath it's still waiting for and what last went wrong, so you can tell us. A
  square that fails to load is tried again a little later, and Play never waits on it. Phones and
  tablets load one square at a time, to stay inside their memory.
- **Light on memory**: the parts of Bath you leave behind are let go of as you travel, and built
  again when you come back. However far you can see, only the nearest squares are built in full
  (25 on a computer, enough for the furthest view it picks for itself, and 9 on a phone or
  tablet); past them the simpler town stands in, as it does beyond the fog. `?squares=16` in the
  address tries another number.
- **Smooth on any machine**: the game picks how far you see, the resolution and shadows for your
  device (a quick check of its processor and graphics chip as it loads, then the menu's backdrop),
  and if frames get slow for a few seconds it eases back gently: shadows redrawn less often, then a
  few fewer lines, then a shorter view (never under 500 m), then no shadows. It steps back up when
  there's room, and never thins out trees, buildings or grass. Choosing a draw distance, resolution
  or shadows yourself (or L in the debug panel) turns this off; tick Automatic in Settings to turn
  it back on.
- **If your phone crashes starting a game**: the next time you open the page it starts in safe
  graphics (no shadows, no retro look, fewer lines, a shorter view) and says so; turn things back up
  in Settings. Phones draw simpler shadows, and ones with a graphics chip the game doesn't know
  start with shadows off. On a touch screen the paper you get on joining never blocks the controls:
  your first touch puts it away.
- **Tidy on a phone or tablet**: every part of the screen has its own place, so the buttons never
  cover the map, your job or a boss's health, and the plates are low strips along the bottom.

## Run it

```sh
cd web
npm install
npm run dev          # http://localhost:5173
npm run build        # typecheck and build: the check before merging
```

Add `?net=local` to the URL to link tabs in one browser instead of using WebRTC (handy for
testing). More address options are listed in [docs/playing.md](docs/playing.md#address-options).

Every push to `main` builds the game and publishes it to GitHub Pages
(`.github/workflows/pages.yml`; Settings → Pages → Source: GitHub Actions).

`python3 -I tools/build_single.py web out.html [map]` makes one self-contained HTML file with one
map inline (Combe Down unless you name another), for solo practice only.

## Play counts

If whoever put the game online has switched it on, the game sends play counts so they can see
roughly how many people play, for how long, on which map and in which mini-games, and how big the
rooms get. It sends the name you chose to play under, a random number kept in your browser, a random
number for each tab, which copy of the game you are playing (its web address), whether you are on a
phone, tablet or computer and the model of its graphics chip, the map, the game's version, when a
race, ball or the mines start and stop, and at the end how smoothly the game ran (frame rate and how
much it drew each frame). Every half minute it notes which 50 m square of the map you are in, without your name. Your
room's code goes along scrambled so it can't be read back, and the host of a room also sends how
many are in it. In a game with friends it also says, twice, how your network treated it: whether it
reached the servers that find other players, how many it found, and what kinds of link your network
allows (nothing about who they are). If something goes wrong in the game (an error, the graphics giving
out, a part of the map that won't load) it sends what went wrong and where in the game's code, once
each. Once per version of each map, a computer also sends the game's own picture of the whole map
(nothing about you) if the server hasn't got that version's yet, for the map of where people go. It
never sends chat, voice or your address. Add `?telemetry=0` to the address to
turn it off; the game remembers. Builds that aren't set up for it (your own copy, for one) send
nothing at all.

## Rebuild a map

Bath is one map, built in full-detail squares about a kilometre across (`tools/prep_tiles.py`).
The game loads a small file about the map as a whole (`web/public/maps/combe-down.json`), streams
in the squares round the player, and lays a lighter whole-city file underneath for the minimap and
anywhere a square isn't loaded yet.

The map tools write JSON, and that stays in the repository as the map's copy, but the game
downloads the squares, the whole-city file and the ground kinds packed (`web/src/pack.ts`): the
same numbers to the last decimal, as whole numbers in small binary streams, gzipped.
`npm run build` and `npm run dev` pack them (`tools/pack_squares.mjs`, only what has changed since
last time), check every pack reads back exactly as its JSON, and stop if one doesn't; the site
carries only the packs. Two more checks load the map both ways through the game's own code and
compare what it does: `node tools/pack_behave.mjs --map $MAP` (ground, floors, walls and rays on a
grid over every square) and `node tools/pack_scene.mjs --map $MAP` (every model built for every
square). `node tools/pack_squares.mjs --export <dir>` writes the packs back out as JSON, for
running the map tools on exactly what the game gets.

Everything the map is built from is kept in `data/combe-down/` (`tools/mapdata.py`), so it rebuilds
from a fresh clone with nothing to download, byte for byte the same map everyone else gets. It
needs Python 3 with numpy, shapely and Pillow:

```sh
pip3 install numpy shapely pillow scipy scikit-image
MAP=combe-down
python3 -I tools/mapdata.py unpack $MAP        # the repository's copy -> data/raw/$MAP/wide
# the canal and railways first: the squares cut the ground to the levels these work out
# (the canal moors its boats where data/$MAP/moorings.json says: tools/moorings.py finds them in the lidar)
python3 -I tools/canal.py $MAP data/raw/$MAP/wide web/public/maps/$MAP-canal.json
python3 -I tools/railway.py $MAP data/raw/$MAP/wide web/public/maps/$MAP-rail.json
python3 -I tools/prep_tiles.py $MAP data/raw/$MAP/wide web/public/maps/$MAP
python3 -I tools/prep_wide.py $MAP data/raw/$MAP/wide web/public/maps/$MAP-wide.json
python3 -I tools/pubs.py $MAP data/raw/$MAP/wide web/public/maps/$MAP-pubs.json
python3 -I tools/ground_kinds.py $MAP
python3 -I tools/region.py $MAP                # heath, grass and trees, from data/$MAP/region.json
```

`prep_tiles.py` builds each square with `tools/prep_map.py`, then, as its last stage, lays the
ground of the whole map out as one partition (`tools/partition/stage.py`), for every map, not just
Bath: every bit of ground is a street, a pavement, a garden plot, a path or open land, the streets
are fitted once across the whole city, the plots follow the Land Registry's parcels where the map
has them (England and Wales) and the blocks and the houses' fronts everywhere else, and every wall,
fence, hedge and gate stands on an edge between two of them. A map without the lidar's wall runs
(outside England) has only its mapped walls and the guessed boundaries; one without the kept lidar
(`partition.zip`, below) keeps every guess whether or not anything is seen standing there.
`--no-partition` builds `prep_map.py`'s squares straight into the game's folder instead, as every
map was built before, to compare the two. Each garden has one style of front and the gardens round a block one
of fence or hedge, and in Georgian Bath (where the houses round a street are tall town houses, or
Historic England lists railings all along it) a front garden's edge nothing was seen along is iron
railings. Buildings stand at the eaves height the lidar measured, and you walk and drive on the
streets as they're drawn. `prep_map.py`'s squares are kept apart, in
`data/raw/$MAP/wide/partition/prep/`, as the partition's starting point, and only the partition's
squares go into `web/public/maps/$MAP/`, so a rebuild never puts the old-style squares in the game.
What the partition needs from the lidar is kept in `data/$MAP/measured/partition.zip` (Bath's
only, so far).
The churches' towers and spires are measured from the lidar by `tools/towers.py` and kept in
`data/$MAP/measured/towers.json`; run it again (with the raw lidar) to measure them afresh.

`prep_map.py`'s squares take about 3 minutes on a 14-core Mac. The partition takes 25 to 35 minutes
more the first time (five and a half hours of processor time, nearly all of it dividing the blocks
into plots); what it works out for the whole city is kept, and worked out again only when its tools
or the map's data change. A second run only rebuilds the squares whose data or tools have changed,
and the partition then writes only those squares again: about 3 minutes when only the partition's
writer has changed, and seconds when nothing has. `--only ti,tj ...` rebuilds those squares and writes just
those, reusing the passes. With `--shard`, the partition isn't run: gather every share's
`partition/prep/` on one machine and run `prep_tiles.py ... --partition-only` there, as the
workflow below does. On GitHub, the "Rebuild the map" workflow (Actions tab, Run workflow) does the
same across ten machines, then the partition on one (an hour or two on its four cores), commits the
map files and redeploys the game. It only runs when started by hand. Its partition step hasn't run on
GitHub yet: start it with "push" off the first time (`gh workflow run rebuild-map.yml -f push=false`)
and check it reports no map files changed before letting it commit.

A change to what is measured from the lidar or the canopy (`tools/lidar.py`, `tools/canopy.py`,
`buildings.roof_parts`) needs the raw data again. Fetch it from the public sources (about 2.5 GB,
plus the energy certificates by hand), add `--measure` to the `prep_tiles.py` and `prep_wide.py`
steps, then pack it back:

```sh
pip3 install overturemaps rasterio pyproj scipy scikit-image
python3 -I tools/fetch.py $MAP                  # -> data/raw/$MAP/wide (see the top of fetch.py)
python3 -I tools/lidar_ground.py $MAP           # the terrain tiles take the lidar's ground wherever it covers them
# ... the build above, with --measure on prep_tiles.py and prep_wide.py ...
python3 -I tools/mapdata.py pack $MAP data/raw/$MAP/wide     # also the partition's lidar, from the build's passes
```

With only the lidar and canopy fetched (`tools/fetch.py $MAP --only lidar,canopy`, after
`mapdata.py unpack`), the same `--measure` builds measure afresh from the data already in the
repository.

Roofs can also be fitted to the lidar: each house is cut into its main body and wings, and each
gets a plain roof (gabled, hipped, mansard, lean-to or flat) whose pitch, height and ridge the
survey decides, steep where the survey says so. Wings meet the main roof in valleys, as cross
gables do, and a terrace or a pair of semis is decided together, so a row reads as one roof that
steps only where the survey shows it really does; where one roof steps down to another the step
has its wall, so no roof shows a gap into the house. The roofs for every square are kept in
`data/$MAP/measured/faces/`; a building the survey can't see, or whose row the new roofs don't fit
clearly better, keeps the flat, gabled or hipped roof that fits it best; one too far off square for a single rectangle (an L or a T, a church with its apse and chapels, a wedge on a corner plot, a block round a courtyard) gets one roof following its whole outline, hips, valleys and ridges as a roofer would lay them and gables at the ends of a gabled building's wings, rather than a few gables on a flat cap; a block too deep for its pitch is flat on top. The parts a building is split into, and every house of a row, share one roof covering and one wall; a house keeps the ridge the lidar fits to it wherever that fit is plainly better one way than the other and hips no party wall (and its hipped or gabled ends where the fit is plainly sure of those too); where it isn't (most footprints are drawn a metre or two off the survey's building), a house in a row of alike houses takes its row's ridge direction (as its sure houses run, or along the row) and roof form, so a semi's halves are hipped or gabled together, and a corner house or end pavilion of another shape keeps its own. Steps in height between them stay, with the gable wall showing, as Bath's rows climb its hills. `python3 -I tools/roofs/shapes.py ti,tj ...` fits the roofs over a square as last built
without them (a row keeps its old roofs where the new ones don't fit the survey clearly better),
`tools/roofs/errors.py` measures how far every drawn roof is from the survey, and `?roofs=simple`
in the address draws the old roofs everywhere, to compare. Rule 11 of `tools/check_map.py` counts
broken roofs: openings between faces, bare footprints, walls facing indoors, roofs past their
walls or too tall, faces lying over each other and buildings standing in each other, and, on the pitched roofs too, a roof covering only part of its building, roofs over one building that don't meet, buildings sharing a wall whose roofs differ in covering or colour, alike houses in a row with their ridges turned against each other, and a semi's halves roofed differently (listed on a line of their own where the lidar is sure of both halves' ends). Every roof is
solid where it's drawn: you stand on the strips closing the slits between its faces, walk into its
steps rather than through them, land on it however fast you fall, and stand on a building that
reaches over from the square next door. Rule 22 (`tools/roof_probe.mjs`, the game's own code run
without a browser) drops a player on every point of a sample of roofs in each square to check.

In England and Wales the 2021 Census says how many homes in each street are flats, terraced,
semi-detached or detached, and the build follows it wherever the map data doesn't say, so a street
of flats or of semis looks like one. A conservation area that no character area covers is the
town's old core: its houses are built of what the old buildings round them are made of (Bath stone
in Bath, stock brick in Hackney), each a shade of its own, with a painted front where the houses
round it are painted, and its tall terraces get parapets, tall sash windows and railings. London
stock brick has a look of its own: yellow to grey-brown bricks in pale mortar, sooty, with red
brick arches over the windows and red bands at the floors.

Each map's centre, size and character areas are in `tools/area.py`. To make a map of somewhere
new, follow [docs/new-area.md](docs/new-area.md): every download (lidar and canopy included),
where it goes, the build, and landmark packs. A map with no wide area is one file, built with
`python3 -I tools/prep_map.py $MAP data/raw/$MAP web/public/maps/$MAP.json`.

Two other maps are set up but left out of the main menu: Royal Victoria Park (in `tools/area.py`;
build it and add it back to `web/src/maps.ts` to try it) and Hackney, a kilometre round the
Pembury Tavern in east London, which has its own page, `pembury.html`. Hackney is built like
Bath, in full-detail squares with the lidar's roofs, and its buildings take their floor counts and
brick from the map data: stock-brick terraces with bay windows, red-brick council estates and
tower blocks, and Georgian terraces with parapets and railings round Clapton Square and Sutton
Place. Its data is kept in `data/pembury/` (rebuild it as Bath's, with `mapdata.py unpack pembury`).

Cape Town has its own page too, `cape-town.html`: the first map outside the UK. It stands on the
City of Cape Town's own survey of its ground (the 2 m contours from its 2019 lidar), its buildings
are as tall as the City measured their roofs, and its trees grow where the City outlined their
crowns (`tools/cct.py`, which any map inside the City picks up). Where OpenStreetMap hasn't mapped
the houses yet, as through much of Newlands and the southern suburbs, they come from the City's own
footprints and then Google's machine-learned ones (`tools/footprints.py`); with no energy certificates, what
the buildings are made of is guessed from the area's character. It runs from the V&A Waterfront through the city centre, the
painted houses of the Bo-Kaap and Gardens to the top of Table Mountain, which you can see from
anywhere on the map, and you can ride the cableway up it. Round the back of Devil's Peak it goes on
through Woodstock, Salt River, Observatory and Mowbray, past UCT and Rosebank to Newlands, its
forest and the rugby stadium, and the top of Kirstenbosch. Hand-made set pieces stand in for the
Castle of Good Hope, City Hall, St George's Cathedral, the Auwal Mosque, the Clock Tower, the Cape
Wheel and Zeitz MOCAA. Its houses stand behind high plastered walls and steel palisades, with
masonry walls between the plots, as Cape Town's do. Table Bay and the harbour are sea, held at sea level (`sea` in
`tools/area.py`). Rebuild it with `fetch.py --only overture,canopy,osm,city,footprints` (or `mapdata.py unpack`),
then `prep_tiles.py`, `prep_wide.py`, `ground_kinds.py` and `cableway.py`.

## Play your own street

Any place can be a map. `python3 -I tools/new_area.py find "Your Town"` finds it,
`python3 -I tools/new_area.py add "Your Town" --lat N --lon N --radius 1500` adds it as a test map
(`--in-menu` puts it on the menu too), and `python3 -I tools/new_area.py build your-town` downloads
the open map data and builds it, which takes a quarter of an hour or so on a laptop; `verify` and
`shoot` check it. Then `cd web && npm run dev` and open `?map=your-town`. It works anywhere: in England the lidar gives the real roofs, garden walls and church towers, and
elsewhere they are guessed from the open map data's heights and floor counts. Wherever the data
has them, buildings take OpenStreetMap's floor counts, roof shapes, wall materials and colours, a
house with no energy certificate is built of what its neighbours' certificates say, and mapped
street lamps stand where they really are. Away from the lidar the terrain is a coarse survey from
space, with buildings and trees in it, so the streets are graded as roads are built: the whole
network at once, every junction at one height, no street steeper than its kind of road may be
where the hill allows, and the ground cut and banked to them. On the lidar the streets stay where
it measured them. [docs/own-area.md](docs/own-area.md) says what you will need installed
and what the script can't do for you. If you use Claude Code, ask it to make a map of your area and
it follows the `new-area` skill.

## Credits

Map data © OpenStreetMap contributors (Open Database Licence), Overture Maps Foundation,
Microsoft. Elevation and building heights contain Environment Agency data © Crown copyright (Open
Government Licence); terrain tiles by Mapzen (Amazon Terrain Tiles), with the Environment Agency's lidar ground laid over
them wherever it covers them. Tree canopy from Meta and
World Resources Institute's High Resolution Canopy Height Maps (CC BY 4.0). Wall materials from
Energy Performance Certificate data (Open Government Licence) located with OS Open UPRN, which
contains OS data © Crown copyright and database right. Food hygiene ratings from the Food Standards
Agency (Open Government Licence). Plot boundaries in England from HM Land Registry's INSPIRE Index
Polygons: this information is subject to Crown copyright and database rights 2026 and is reproduced
with the permission of HM Land Registry; the polygons (including the associated geometry, namely x, y
co-ordinates) are subject to Crown copyright and database rights 2026 Ordnance Survey AC0000851063.
Listed railings and walls contain Historic England data ©
Historic England 2026 (Open Government Licence). House types from the 2021 Census: source, Office
for National Statistics, licensed under the Open Government Licence v3.0. Conservation areas from
planning.data.gov.uk: © Historic England 2026 and the local planning authorities (Open Government
Licence). Both contain OS data © Crown copyright and database right 2026. Cape Town's ground
contours, building heights, building footprints and tree canopy: City of Cape Town (its Open Data
Policy). Cape Town's other buildings OpenStreetMap lacks: Google Open Buildings (CC BY 4.0 or ODbL),
by way of VIDA's combined copy (ODbL). The copy of the map data in `data/` is shared under the same
terms (see `data/combe-down/README.md`, which also says where each part comes from).

Multiplayer runs over WebRTC with [Trystero](https://github.com/dmotz/trystero).

Eric's oak, up on Bathampton Down, is in memory of our friend Eric Benjamin Holmes.
