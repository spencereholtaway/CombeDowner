# To do

Things we mean to get round to. Tick them off as they're done (change `[ ]` to `[x]`), and add new
ones wherever they fit. Anyone can add to it, people or Claude.

## Fixes

- [ ] The live site has no TURN relay, so players on strict networks (mobile data, some work and school wi-fi) can't connect or hear each other. Plan: Metered's free Open Relay (metered.ca/tools/openrelay, 20 GB a month, about 280 hours of one relayed pair talking). Sign up, put the app name and API key in repo secrets `METERED_APP` and `METERED_KEY`, and have `net.ts` fetch a fresh TURN login from `https://<app>.metered.live/api/v1/turn/credentials?apiKey=<key>` before joining a room, falling back to direct-only. The key is readable in the page, which is fine for a free relay: swap it if the usage graph shows someone else using it
- [ ] Traffic still sometimes brushes other cars in tight squeezes
- [ ] The village map file (`combe-down.json`, the middle 3 x 3 squares) is 16.2 MB, about 3.8 MB zipped, and has to load before you can play. The garden walls, fences and hedges are its biggest part (3.6 MB): thinning the points along straight runs would halve them
- [x] The capped roof wings have only been checked in code, not looked at in the game
- [ ] Settle the Palladian Bridge: does it look right and is it in the right place?
- [ ] Bath Spa station (`web/src/landmarks/bathspa.ts`): the subway under the tracks from the booking hall to platform 1 isn't built yet (you go round under the railway by Railway Place). It needs the platforms' brick sides in `railway.ts` to leave a gap where it passes under them. Bath's squares also pick up the station's level track only on their next rebuild (`tools/railway.py`; the track there is all on the viaduct, so the ground under it isn't affected)
- [x] Pulteney Bridge as a hand-made landmark (a set piece, `web/src/landmarks/pulteney.ts`, with Bath Abbey and the Roman Baths): Argyle Street runs on vaults with the shops built on the bridge itself, which the rules can only build as a street on a ridge with grass slopes beside it
- [x] Rebuild the Combe Down map itself with the lidar so it gets the smoothed road profiles, the sloped river banks and the exact bridge spans the same way as the squares of Bath round it
- [ ] Scenery rules: `python3 -I tools/check_map.py combe-down --all` lists where the built map still breaks them. Left after the last rebuild: a few dozen steep or kinked stretches on lanes the survey really has that steep (Bennett's Lane, Woods Hill, Lansdown Lane, Prospect Place, Meadow Lane, the Midford Road junction under the Two Tunnels viaduct and the Greenway's ramp down to it), the service road the data lays along the top of the A46's Bailbrook Underpass, a handful of footways Overture marks as bridges over another path with no height difference, the private crossings of the railway at Bathampton and Ferry Lane, which really are at grade
- [x] The village map (`combe-down.json`) is built by the same tool and rules as the squares round it; the game no longer patches banks, bridges or corridors at load time
- [x] Shops are in slightly the wrong places in the expanded map: the squares of Bath now take their shops from OpenStreetMap, the food hygiene register and the business energy certificates, as the village does
- [x] Trees stand in the middle of streets in the town centre where there are none: the lidar's "tops" against buildings in town (cornices, signs, eaves) are no longer trees
- [ ] Some roads are the wrong width and have jagged angled holes in them: the pedestrianised streets in town are now paved wall to wall at their measured width; still to find where the angled holes are (in progress in the "Map fixes in town" thread: road widths from OpenStreetMap lane and pavement data)
- [ ] Milsom Street's two bus stops (and Arrivals Square's at the University) stand in the middle of the paving with no name or facing: the street is buses-only in the daytime, so the build paves it as a pedestrian street, and a stop with no road within 25 m is left where it's mapped (`tools/streets.py`). Either make Milsom Street a road (it's the night out's spot and the manual run in `stunts.ts`) or stand such stops at the paving's edge. The main roads with bus gates (Broad Street, Northgate Street, High Street, Manvers Street) are roads again
- [x] Bridges are a mess generally: every span is now carried straight from abutment to abutment along the whole road (the data's pieces joined up), its approaches following the road's own slope (no more 40 m level shelves and plunges), side roads meet a deck at its height, the drawn road meets its parapets at each end, a square's edge no longer puts a pier mid-bridge, and pavements over Spring Gardens Road ride Argyle Street's deck instead of being stone footbridges
- [x] The canal cuts through the land (`web/src/works.ts`): its banks, towpath, verges and retaining walls are its own, with the ground cut away under them; the towpath stays level, and goes through the Sydney Gardens tunnels on a ledge, with the ground cleared out of both bores and the streets over them on the tunnels' cover
- [x] Canal tunnels: walking through on the towpath ledge (`CanalWorks.bore` in `web/src/works.ts`: a floor of its own, down in the bore only, so the street over a shallow tunnel stays a street)
- [x] Falling through bridges: you're held up wherever a deck is drawn (out to its parapets, and the highest deck you're on where two overlap), canal bridges have an arch over the water and towpath with no pier in it and the canal's walls stop under their decks, a path the map doesn't mark as a bridge is never built as one (Pulteney Gardens had a towpath's parapets across the road), the white slivers along the canal's edge are filled, the locks' banks carry on under their paving with no gaps, and Argyle Street is level with Pulteney Bridge
- [x] The canal checked end to end from the water and the air: footbridges the data splits into pieces built whole (no abutments in the water), lock-gate footbridges on the lock walls, paths along a lock moved onto its paving, the Sydney Gardens tunnels buried in their hill, Bath stone on the locks, the ground's slivers past the canal's edge filled (and the gaps in the verges at bends: the ground's cut now follows the banks' own lines across), no wood canopy over the water or the banks, the Dundas Aqueduct running on over the railway with its arches clear, and boats moored in the water (mapped as buildings) left out
- [x] Moored boats are where the lidar saw boats moored (`tools/moorings.py`, `data/combe-down/moorings.json`; aerial photos can't be fetched from the build machines), and any of them can be cast off and driven; the steerer ducks under low bridges and a low bridge knocks you off the roof; the Dundas Aqueduct is a set piece (`landmarks/dundas.ts`)
- [x] Bridges no longer end in the air: a deck still well above the ground where its road goes on ramps down to it, paths dipped under bridges have their ground dug out, and the canal's junction at Dundas is a basin (the stretches' banks no longer stick out into one another's water)
- [x] Roads smoothed as a network (`smooth_network` in `tools/prep_map.py`), the railway laid at railway gradients and level across its bridges (`tools/railway.py`, `tools/profiles.py`), and Bradford-on-Avon's canal, railway and squares rebuilt to the same rules
- [ ] Walls are missing everywhere: Overture/OpenStreetMap only has about 560 walls in the whole of Bath (all already drawn), and the rest are guessed from garden plots; the lidar shows the real boundary lines (walls, fences and hedges, without saying which), so they could be traced from it (in progress in the "Map fixes in town" thread: lidar-traced walls across Bath, being tested on Dan's fork first)
- [x] Cat balance: waiting on Dan's feedback after playing (Spencer edited the cat rules: they're in residential areas mostly, spawn less frequently when in "Attack mode" and have a 30s cooloff now (13/10/2026)
- [ ] Sound crackling and the computer slowing down: the scenery no longer keeps a second copy in memory (about 680 MB down to 445 MB, no leak found); check it's gone on the machine that had it. Since then (16/10/2026): one limiter on the whole mix so it can't clip, a roomier audio buffer ("balanced"), and engines, ride noise and voices no longer queue a new setting every frame when nothing's changed (`glide` in `audio.ts`). Still open: travelling by train keeps the old game alive, because `net.on` handlers can't be removed, so it hears shots twice and holds its map in memory

## Streets

- [x] Spencer: adding all of Bath with basic, existing scenery. Bounds are bath racecourse in the north, university of Bath (east), bath spa uni (west),Twinhoe (south). Done at Combe Down's detail, and everything works across the city: traffic, naughty boys, cats, pickups, buses, cars, pitches
- [x] Twerton Park: check it against photos (the network here couldn't reach any), and let the ball games run on the pitches out in the rest of Bath too (only Combe Down's have them)
- [x] Spencer: canal boats (with working locks, the Sydney Gardens tunnels and the Dundas Aqueduct)
- [x] Railways: InterCity 125s and Sprinters through Bath Spa and down the Limpley Stoke valley
- [ ] Play-test the canal with two players: working a lock while someone's at a tiller, and riding a boat up the Widcombe flight
- [x] Railways on the minimap
- [ ] Level crossings and footbridges where paths cross the line (the mapped footbridges already get decks and parapets)
- [ ] The canal's water out in the wider map (beyond the full-detail squares) still sits at the map's old levels
- [x] Spencer: teleporting (pubs as nodes): Go to a pub, from the pause menu's map
- [ ] Food hygiene ratings for the pubs: run `tools/fsa.py` and `tools/pubs.py` where the FSA's API is reachable (see docs/new-area.md)
- [ ] Respawn location: let players choose, e.g. near the nearest group of friends
- [x] "COMBE DOWN WITH ME": an Overcooked-style co-op cooking game in the deli (first version in; follow-ups below)
- [ ] Bike time trial through the Two Tunnels, with ghosts of your friends' best runs
- [ ] Village fete on the rec: coconut shy, tug of war and a cat show where the cats judge back
- [x] Day and night cycle: at night the lamps go out and the cats get braver (a day every 24 minutes, the same for everyone; street lamps and windows light up and the cats get braver after dark)
- [ ] BMX track at Odd Down like Motocross Maniacs (side-on, jumps and loops, tilt to land), raced live together as see-through riders, with best-run ghosts
- [x] Cable car from Fox Hill to the town centre: Curo's 2017 Mulberry Park to Bath Spa line, with two cabins you can ride

## Under Combe Down (the mines)

- [ ] Play-test the "Stay on the street" button and the new rules for who's host in the mines
- [ ] Test the inventory with two players

## COMBE DOWN WITH ME (the deli)

- [ ] Play-test a shift with two to four people, and tune how fast orders come in and the star thresholds
- [ ] Washing up: dirty plates come back through the pass and need the sink
- [ ] Couch co-op: a second cook on the same keyboard
- [ ] More kitchens or a harder second level (fires to put out, a moving counter)

## Done

- [x] Start a to-do list
