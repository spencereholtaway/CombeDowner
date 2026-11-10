# Writing a team challenge

Team challenges are the big things to do on a map: the lock run, the balloon tightrope, the co-op
climb, the bell ringing, pushing the bus, the art gallery. The map opens a zone at a time (`web/src/zones.ts`), each
zone has one or two challenges, and they stay shut until their zone is open; each one won leaves
one of the strange objects (`web/src/oddments.ts`) where it finished, which is how the next zone
gets opened. This page is for whoever writes the next.

## The interface

A challenge is one file in `web/src/` that calls `registerChallenge` (`web/src/challenges.ts`) and is
imported once from `game.ts` (next to `import "./challengetest"`).

```ts
registerChallenge({
  id: "lockrun",                 // also its job kind: keep it short and unique
  name: "The Lock Run",          // the title card, the poster and the fly-over
  blurb: "Take a boat up the flight before the pounds run dry",
  glyph: "L", colour: "#3a8fd8", // its badge on the maps
  tier: 1,                       // lower opens first; ties open in id order
  stars: 3,                      // how hard, for the poster
  place(map) { ... },            // ChallengeSpot[] | null
  start({ offer, spots, w, started, by }) { ... },   // returns a Job (quests.ts)
  goal: (o) => "Get the boat to the top lock",       // optional: the start card's line
  waiting({ offer, spots, w }) { ... },              // optional: what stands there till it's taken
});
```

`ChallengeSpot` is `{ x, z, name, y?, a? }` in scene coordinates (x east, z = minus north). The
first spot is where the challenge is: its badge on the maps is there, and the fly-over looks at it.
Further spots are yours to use (the other locks, the far end of the tightrope).

`start` returns a `Job`, exactly as a job kind's `start` does in `quests.ts`: `update`, `host`,
`event`, `card`, `progress`/`restore`, `use`/`hint`, `hit`/`shoot`, `end` and `done`. A job that
holds you off your own feet (a tightrope, a basket) returns where from `perch(dt, move)` each
frame, with a tilt to the view, a way to face, or somewhere else to watch from; `w.pose` leans
someone else's body over or sets their arms flailing (`tightrope.ts` uses both). Read the
`Job` interface there; `race.ts` and `gulls.ts` are good ones to copy from. Set
`done = { won, text, x, z }` when it's over, with `x, z` where it finished: that's where the object
appears. A lost challenge leaves no scar.

## Placement

`place(map)` works out where the challenge goes **from the map's own data**, so it fits any map:
Bath, Bradford-on-Avon, Cape Town, someone's own street. Return `null` when the map hasn't got what
it needs (no canal, no church tower), and the challenge is simply left out of that map; the
milestones spread out over the ones that are left.

- Read only what every player has from the start: `map.d` (the first area) and `map.wide` (the
  whole map, roughly: `wide.rd` streets, `wide.wp` water, `wide.buildingsNear`, `wide.treesNear`,
  `wide.d.pl` named places, `wide.ground`). Squares (`map.tiles`) stream in later and differently
  for each player, so never read them in `place`: everyone must get the same answer.
- Use the map, not a list of coordinates: the longest steep street, the tallest lidar walls
  (`map.d.wl` with `h`), the biggest field (`pl`), the canal's locks (`map.canal`), the church with
  the tallest tower. `openGround` in `oddments.ts` is a worked example (and `challengetest.ts`
  places its spot with it).
- Keep clear of the structure's own spot (`openGround(map)`), and of the force field's edge
  (`map.fieldEdge(x, z) > 60`).
- **Zones limit where you go.** `place` is called once for each zone, with a `map` whose force
  field is shrunk to that zone: `map.fieldEdge` and `map.fieldInside` answer for the zone alone,
  and everything else is the real map. So checking `fieldEdge` as above is all it takes to stay in
  the zone; return `null` when nothing in this zone will do, and you'll be asked about the next.
  Lower tiers are tried first and go in the nearer zones; each zone takes one, then a second if
  there are challenges left over. A cache keyed on `map` (a `WeakMap`) is kept per zone, which is
  right. Don't use `map.fieldEdgeBase`: that's the whole force field.
- `start`, `where` and `waiting` are handed the whole map, not the zone's, so working the place out
  again from `w.map` can find somewhere outside the zone. Keep what `place` found against the spots
  array it returned (a `WeakMap`, as `pushbus.ts` does with its hills and `theclimb.ts` with its
  face) and look it up from `spots`, which is the very same array.
- It must be deterministic: no `Math.random`, no clock. Sort ties by name.

## Opening, and what waits at its place

Each zone but the last has its own structure with a few sockets (5 on Bath's six zones, 6 on smaller
maps). A challenge opens with its zone: the first zone's are open from the start, and when a zone
opens, everyone in the room gets the fly-over to its first challenge's first spot, with the zone's
name. A challenge has no noticeboard. Every day the thing itself stands waiting at the spot where
that day's run happens, with the challenge's badge on the maps: walk up to it and its poster shows,
and E (or Use) takes it on for the whole room. A challenge whose place changes by the day (Push the
Bus picks its hill from the day) says where with `where(seed, spots, map)`, from the day's seed
alone, and `start` must pick the same place from `offer.seed`. Opening the last zone plays the finale.

`waiting({ offer, spots, w })` builds what stands there, and returns a `Waiting` (`quests.ts`):

- `dist(x, z)`: how far a point is from it. Within 7 m its poster shows and E takes it, ahead of
  getting into any vehicle parked by it.
- `update(dt, t)`, every frame while it's up, and `dispose()` to take it all down again.
- `obstacles()`, optional: anything in the road for the traffic to pull round.
- `stamp()`, optional: a number that goes in the poster's `mode` when it's taken, for when where it
  stands depends on more than the day (the bus moves up the hill past a bus stop the squares loaded
  there put in its way), so `start` puts its own in the very same place on every screen.

It's built when someone comes within a few hundred metres and their square is in, taken down when
they leave, while the challenge runs and once it's done for the day. Build it from the map, the
spots and `offer.seed` alone (each screen builds its own, and nothing goes over the network), and
make it what `start` will draw in the same place at the start: the same bus, the same balloons, the
same boat, so nothing pops or jumps when it's taken. Reuse the challenge's own models for it, and
keep it to a few draw calls. Left out, the place gets a ring of light and the badge turning over it.

To test: `?objects=5` drops that many objects round you (and registers the test challenge, Stand
Together), and `?zone=3` opens up to zone 3. In the console, `__game().oddmentsHere(5)` drops more,
and `__game().challengeZones()` lists which zone each challenge went in. `node tools/zones_probe.mjs
combe-down cape-town` (from `web/`, after a build) prints every map's zones and challenges.

The quickest way to play one is the games list (`web/src/gameslist.ts`), a hidden page on the main
menu and the pause menu. Ask the co-developer for the word, open the game once with `?games=<word>` and the list
stays on that device (`?games=0` takes it off again). It lists every challenge (with a note for
any this map hasn't placed) and every kind of job, and the pub takeover. Pick one and you, and
everyone in your room, are put at its start, with the zones' wall down and never mind whether it's
open or done today; it lines up and starts as usual, and when it's over the list comes back.

## A space of its own

When the map hasn't got the right place for the play (a ringing chamber, a proper crag), build one
and take the players there. Three do: `bells.ts` puts its ringing chamber 50 m over the street by the
church, `theclimb.ts` its crag (`crag.ts`) 1000 m over the foot of the tallest face on the map, and
`gallery.ts` its gallery room 50 m over the street outside a museum. The pattern:

- What waits stays on the map, where `place` put it, and taking it on (or E there later) moves you
  into the space with `w.moveTo` (then your feet's height, on `w.body()`). Leaving, and the job's
  `end`, move you back to the entry, and `done.x, z` is there too, so the object turns up on the
  street where everyone comes back down.
- Build it high over the entry, not off the edge of the map: the force field, the squares, the
  minimap and the sound all stay as they were. Only show it while the camera's up there.
- Make it solid with `map.floors` and `map.pushers` (keep them to the space's own height, so
  nothing on the street below stands on it), and wall it in so nobody can walk off it.
- Build it from a fixed design (or the seed) only, so every screen has the same space; nothing about
  the space itself goes over the network.
- Let the host know who's up there (the Climb's "cs" says so), so someone who's gone back down
  doesn't hold up the win.
- Return true from the job's `aloft()` while you're up there, and the street's HUD (the place
  name, the force field warning, the minimap and compass) is put away until you're back down.
- A space can hold a screen of its own too: the Art Gallery (`gallery.ts`) puts up a paint program
  (`easel.ts`) while you're at your easel. While it's up the mouse is let go (main.ts asks
  `easelUp()` before treating that as a pause) and keys are caught before the game sees them; the
  job's `perch` holds you at the easel meanwhile. Anything big that has to go round (a painting, the
  whole show's script) goes in pieces of a few kilobytes inside "qe" and is put back together on
  arrival.

## A car of your own

A challenge can put one of the game's own vehicles out for players to drive like any other (The
Driving Test's learner car, `drivingtest.ts`): `w.vehicle(i, kind, paint, x, z, a, label)` adds it to
the game's vehicles, and `w.dropVehicle(v)` takes it away again, getting anyone in it out first.
Give it the same number on every screen (anything from `2 ** 39` up, clear of the parked cars, the
traffic and the squares') and build it from the seed on each, and the host's word on who sits where
reaches it as it does any car. `v.kept` holds seats nobody can take (the examiner's), `v.barred`
(host) who isn't let back in, and `v.assist`, on the driver's screen, takes over their controls for a
moment (a dual-control brake, a handbrake yanked from the back). `w.seated()` says which vehicle and
seat you're in, `w.getOut()` gets you out, `w.windows(open)` lets the street's sound in, and
`SFX.carRadio(level)` turns the music up or down as a car radio. A vehicle of the challenge's own that nobody's
driving (Push the Bus's runaway) can be moved with `v.drive` like any car, ploughing through what
`w.shove(v)` lists (the traffic, the parked cars, empty vehicles), and on the host `w.runOver(v)`
puts anyone in front of it under it. Something a finished challenge leaves standing in the road for
a while (the lost bus) goes in `leftInRoad` (`quests.ts`) so the traffic pulls round it. `w.pavement(x, z)` says whether a
point is up on the pavement, for judging the kerb, and `missionSheet` (`missionscreens.ts`) puts up a
filled-in form, for a results sheet.

## Listening to the players

`w.voice(id)` says how loud someone is on their mic (you included): `state` 0 quiet, 1 talking, 2
shouting, and `laughing`, a rough guess. Each player measures only their own voice
(`voicelevel.ts`) and it rides in their position updates, so the host can read anyone's. Nobody's
words are heard or recorded. For your own voice, `voiceLevel.shoutAt` is when your last shout began,
for timing a shout against a beat as Push the Bus does with its "heave", and `voiceLevel.shoutRise`
how sharply it jumped (count only sharp ones, so a mate's shout coming out of your speakers isn't
yours). A shout is heard late (the mic's looked at fifteen times a second, and the loud part of a
word comes after its start), so judge it as if it came about 0.12 s earlier. Without a mic everyone's
quiet, so anything that listens must also work with keys alone.

Anything timed to a shared beat should do as Push the Bus does: each screen keeps its own clock for
the beat and runs it a little fast or slow towards the host's (its last word, put forward by half
the quickest recent round trip and by how long ago it came), never jumping; judge timing on the
player's own screen, and have the host count things as together by beat number, not arrival time.
`?net=local&lag=150,60,400` holds every message coming into a tab for 150 ms, give or take 60, with
a 400 ms hold-up now and then, to try it as if from the other side of the Atlantic.

## The reward

Winning a challenge brings exactly one object, at `done.x, done.z`, once per challenge per game day.
Jobs' prizes still drop as usual. Don't award anything else: no currency, no cosmetics. The other
things that bring an object are a pub won back, and a job finished to gold or three stars (at most
three of those a game day); keep it that way, so there are only twenty or forty to find on a map.

## Who decides what

- The host runs anything shared that thinks for itself (a boat, a bell's swing, the bus's weight)
  in `host(dt)`, and says what happened with `w.send("qe", { k: "...", s: offer.seed, ... })`.
  Every screen gets that in `event`. Remember the host doesn't get its own message: call
  `event` yourself after sending, as `challengetest.ts` does.
- The host decides when it's won or lost. Each player decides only their own hits and moves.
- Anything random comes from `rng(offer.seed)` (`quests.ts`), so every screen builds the same
  challenge. A late joiner gets `progress()` from the host and `restore`s it.
- New message names aren't needed: everything goes through "qe". If you must add one, add it to
  `MESSAGE_TYPES` in `net.ts`, keep it a few letters long, and make it safe to ignore.

## What a good one is like

- **Hard.** It should take a few goes. A team that walks it first time is a team that won't remember it.
- **Real stakes.** Failing costs something you can see: the boat sinks back down the flight, the
  bus rolls back to the bottom, the climb starts again from the last ledge someone held.
- **Shared lives.** Where one player's mistake could end it for everyone, give the team lives
  instead, kept by the host and shown as hearts on the card (`hearts` in `missionscreens.ts`):
  The Climb and the Balloon Tightrope give three, and one more for every two players past the
  first, and a fall costs one (`SFX.lifeLost`, and a line in the feed). Out of lives, put up a fail
  card with `missionEnd` and start again from scratch, rather than ending the job: a challenge
  lost is done for the day.
- **Mistakes are funny.** A wrong move should be a pratfall, a splash, a bell clanging out of turn,
  something people laugh about, not a red screen.
- **No timers where tension does the job.** If the danger is someone letting go of the rope, you
  don't need a clock as well. Use one only when there's nothing else pressing.
- **Scale with players.** Read `w.players().length` when it starts and when it matters: more hands
  on the bus means a heavier bus or a longer hill, more climbers means more ledges that need two at
  once. It must still be possible alone, and better with four.
- **Works everywhere.** On touch screens (the Use and Ride buttons, nothing else) and on a
  controller. Name controls, never keys, in every prompt, card, stage card and poster blurb:
  `ctl("use")` from `controls.ts`, or `{use}` in a string that goes through `ctlText` (the toast,
  the use hint, the mission cards and the poster already do). A hint that offers use says
  `<b>{use}</b>`, which also puts up the touch screen's Use button. Interactions go on use; a
  challenge whose play is quite different gets its own table in `PLACES` and shows it as a strip
  (`strip`) while you're in it. If its buttons have to be its own while you play (the bells' note
  highway lanes), catch its keys before the game sees them (a capturing keydown listener) and take
  its pad buttons with `padTake` (`gamepad.ts`), giving both back in `end`. `node tools/check_keys.mjs` fails on a prompt that names a key, or on
  a control that comes out as its key on a pad or touch screen, or names a pad button that does nothing.
- **Light.** Phones and iPads play this: instanced or merged meshes, built only when someone's near.
