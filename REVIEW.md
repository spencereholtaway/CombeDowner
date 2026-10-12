# Code review: bugs and graphical glitches

A read-through of `web/src` (streets, vehicles, traffic, cats, chavs, roofs, mines, net, voice, the version
check and COMBE DOWN WITH ME) and of `tools/` where it changes what players see, done on `main` at
97e9b43 (12 October 2026). Nothing in the game was changed for this review: each ticket below is for
someone else to fix, with enough detail that they shouldn't need to re-investigate. `npm run build`
passes on that commit.

How to read a ticket:

- **Severity**: `high` breaks play or multiplayer for someone; `medium` is a plainly visible bug or
  glitch; `low` is cosmetic, a leak, or a performance trap.
- **Confidence**: `confirmed` means the code path was traced end to end and the fault is certain from the
  code (and, for the map tools, checked against the shipped `combe-down.json`). `unconfirmed` means it
  follows from the code but depends on browser behaviour or timing nobody has reproduced.
- **Where** is `file:line` on 97e9b43. Lines will drift as fixes land; the quoted code is the anchor.
- Voice chat comes first, because Dan asked for it to be rock solid and low latency. After that, tickets
  run by severity. Tick a ticket off (`[x]`) when it's fixed and pushed.

Things that were checked and found fine are listed at the end, so nobody re-checks them.

---

## Voice chat (first, by request)

The voice path was read in full: `voice.ts`, `net.ts`, the Trystero 0.25.4 media and negotiation code in
`node_modules/@trystero-p2p/core`, and the call sites in `game.ts`, `mines/game.ts`, `main.ts` and
`mines/main.ts`. The core of it is sound: streams that arrive before the game exists are kept and
replayed (`net.ts` `streams`), mic tracks are added to everyone present and to each later joiner, muting
disables the track rather than tearing anything down, and host handover doesn't touch voice at all
(it's peer to peer). Trystero does perfect-negotiation style rollback, so two players adding mic tracks
at the same moment settles itself. What's below is what would still make voice unreliable or laggy.

### [ ] V-01 No TURN relay on the live site, so some players can't connect at all (and so can't hear anyone)
- Severity: high
- Confidence: confirmed
- Where: web/src/net.ts:42-50 (`TURN_URLS` from `VITE_TURN_URLS`), node_modules/@trystero-p2p/core/dist/peer.mjs (`defaultIceServers` are STUN only), TODO.md ("The live site has no TURN relay")
- Player sees: On mobile data, some work, school and hotel wi-fi, and behind a symmetric NAT, a player joins the room name but never sees or hears anyone (or sees some people and not others). Voice fails with the data channel, so it reads as "voice chat is broken" even though it's the whole connection.
- Cause: The build only adds a TURN server when `VITE_TURN_URLS`, `VITE_TURN_USERNAME` and `VITE_TURN_CREDENTIAL` are set at build time; the deploy workflow reads them from repo secrets and the secrets are not set. Trystero's defaults are four STUN servers (`stun.l.google.com`, `stun.cloudflare.com`), which can't relay.
- Fix: Set the three secrets on the repo (any TURN works: Cloudflare Calls TURN, Metered, or a small coturn box) and redeploy. Include both `turn:host:3478?transport=udp` and `turns:host:443?transport=tcp` in `VITE_TURN_URLS` so networks that block UDP still get through. Keep the "Couldn't connect to a player" toast (net.ts:93-98) but say "try a phone hotspot" only when no TURN is configured.

### [ ] V-02 Version-mismatch warnings vanish under the "Mic on" toast, so players never learn to refresh (and stay on a build with broken voice)
- Severity: medium
- Confidence: confirmed
- Where: web/src/net.ts:77-85 (warnings queued until `onError` is set), web/src/net.ts:104-117, web/src/game.ts:244 (`new Voice` before), web/src/game.ts:325 (`net.onError = (msg) => this.toast(msg, 6)`), web/src/voice.ts:152 (`this.say("Mic on: …", 3)`), web/src/game.ts:1906-1909 (`toast()` is one slot), web/src/main.ts:398-399 and 409 (start toasts)
- Player sees: "Someone here has a newer version of the game. Refresh the page…" flashes for a fraction of a second and is replaced by "Mic on: players nearby can hear you" or "You've started ROOM…". The player on the old page never refreshes, so voice (and anything else fixed since) stays broken for them and the "someone is behind" toast nags everyone else.
- Cause: `toast()` overwrites `#toast` text and `toastT`. The version warnings are flushed the moment `onError` is assigned in the Game constructor, which is a few hundred ms before `getUserMedia` resolves and `Voice` says "Mic on", and before `main.ts` toasts "You've started…". The mid-game `version.json` check (net.ts:119-123) and the 10 s "silent peer is an old page" path land under kill/pickup toasts the same way.
- Fix: Give connection and version warnings their own place. Add a `#notice` div to the HUD in `web/index.html` (and `mines.html`) that `net.onError` fills and that stays until clicked, or make `toast()` a queue (`private toasts: {text, secs}[]`, pop the next when `toastT <= 0`). Minimal version: in `game.ts:325` write the message to the feed as well (`this.feed(\`<b>⚠</b> ${esc(msg)}\`)`) so it stays on screen for 7 s under the toast.

### [ ] V-03 Voices in the mines are placed 1.6 m too high (head height added twice)
- Severity: low
- Confidence: confirmed
- Where: web/src/mines/game.ts:1334-1337 (`y: r.avatar.y + 1.6`), web/src/voice.ts:103 and 105 (`p.y + 1.6 - y` and `positionY.value = p.y + 1.6`)
- Player sees: In the mines a nearby friend's voice comes from about a metre and a half above their head, and the 3D panning/distance is slightly off (they sound further away than they are, and fade out a little early).
- Cause: `Voice.update` expects the speaker's feet position and adds 1.6 m itself; the streets pass feet (`posOf`), the mines pass `r.avatar.y + 1.6`.
- Fix: In `mines/game.ts:1336` pass `y: r.avatar.y`.

### [ ] V-04 Someone looking for a game on the street makes every miner renegotiate their voice link, then drops it
- Severity: low
- Confidence: confirmed
- Where: web/src/main.ts:357-367 (`below = connect(\`MINES-${code}\`)` during the lookup, `below.leave()` after), web/src/mines/game.ts:208-212 (`net.onJoin` → `this.voice.join(id)` and `net.send("mw"/"mob")`), web/src/net.ts:104-117 (`ver` and the 10 s "behind" timer)
- Player sees: Nothing visible to the looker. For the players down the mine, every time someone on the street enters that room name a new "peer" appears for 8 s: each miner adds their mic track to it (a WebRTC renegotiation on a live connection), sends it the world and the horde, and then it leaves. On a weak connection the renegotiation can cause a short audio hiccup. The looker's `below` net never sets `onError`, so any version warning it raises is dropped.
- Cause: The mines probe is a full Trystero room join, and the mines game treats every peer join as a player. There is no way for a peer to say "I'm only looking".
- Fix: Cheapest: in `mines/game.ts` `net.onJoin`, delay `voice.join(id)` and the `mw`/`mob` send until the newcomer's first `hello` with `mines: 1` (move them into `onHello` when `isNew`), so a looker that never says hello costs nothing. Alternatively have the probe send `{ look: 1 }` in its hello and have miners ignore such peers.

### [ ] V-05 Sound (voice included) can stay silent after the AudioContext is suspended, with nothing to resume it in play
- Severity: medium
- Confidence: unconfirmed
- Where: web/src/audio.ts:23-25 (`unlock()` resumes only when called), web/src/main.ts:97-98 and web/src/mines/main.ts:45-46 (`pointerdown`/`keydown` listeners are `{ once: true }`), web/src/voice.ts:94-96 (`update` does nothing about `ctx.state`), web/src/main.ts:431 (`resume` button calls `unlock()`)
- Player sees: On an iPad or phone, switch away mid-game (a notification, a phone call, another app) and come back: the music, effects and everyone's voices stay silent until you open the pause menu and press Resume. On desktop Chrome an AudioContext created without a gesture (`?up=1`/`?go=1` pages start the game on load) is suspended until the first click, so the first seconds of voice are lost.
- Cause: iOS puts the context into `suspended`/`interrupted` when the page is backgrounded and doesn't always resume it. The only resume calls are the one-shot listeners and menu buttons; nothing in the game loop or on `visibilitychange`/`statechange` calls `ctx.resume()`.
- Fix: In `audio.ts` `unlock()`, after creating the context add `ctx.onstatechange = () => { if (ctx.state !== "running") ctx.resume().catch(() => {}); }` and in `main.ts`/`mines/main.ts` add `document.addEventListener("visibilitychange", () => { if (!document.hidden) SFX.unlock(); })`, plus a non-once `pointerdown` listener that calls `unlock()` (it's a no-op when running). Needs checking on a real iPad.

### [ ] V-06 Lower-latency, lighter voice: jitter buffer, speech hint and panner model (improvement, not a bug)
- Severity: low
- Confidence: unconfirmed (benefit not measured)
- Where: web/src/voice.ts:146-149 (`getUserMedia` constraints), web/src/voice.ts:184-188 (`panningModel = "HRTF"`), web/src/net.ts (no access to the RTCPeerConnection receivers)
- Player sees: Voice arrives with the browser's default jitter buffer (typically 60-200 ms on top of network latency) and each speaker costs an HRTF convolution, which is noticeable CPU on a phone with four people talking.
- Cause: Nothing is wrong; these are defaults. Opus, 20 ms frames and echo cancellation are already in place.
- Fix: (1) `panner.panningModel = "equalpower"` is a fraction of the CPU of HRTF and sounds almost the same in a game. (2) Set `track.contentHint = "speech"` on the mic track after `getUserMedia`. (3) For the jitter buffer, Trystero exposes the peer connections via `room.getPeers()` (returns `{ [peerId]: RTCPeerConnection }`); in `TrysteroNet` after `onPeerStream`, do `for (const r of pc.getReceivers()) if (r.track.kind === "audio") (r as any).jitterBufferTarget = 0;` (Chrome 112+, Firefox 120+; ignore where missing). (4) Consider `autoGainControl: false` if players report pumping. Measure with `pc.getStats()` `jitterBufferDelay` before and after.

---

## Streets, multiplayer and the match

### [ ] C-01 A newcomer whose id sorts lowest becomes host at once with a blank game: scores, health, chavs, cats, pickups and traffic all reset
- Severity: high
- Confidence: confirmed
- Where: web/src/game.ts:442-445 (`hostId` is `[selfId, ...peers()].sort()[0]`), web/src/game.ts:219 and web/src/main.ts:410 (`known` seeded from the lookup), web/src/game.ts:274 (scores start as just you), web/src/game.ts:288, 286, 288, 291, 303 (`sb`, `ch`, `kt`, `pk`, `tf` only accepted when `!this.isHost`), web/src/game.ts:836-839 (`catchUpLife`), web/src/game.ts:821-828 (`onScores`)
- Player sees: When someone joins a running game and draws a Trystero id below everyone else's (about 1 in n+1 joins), within a couple of seconds every player's kills/deaths/chavs drop to 0, everyone's health jumps to 100 mid-fight, every chav and cat vanishes and respawns from scratch, every pickup is replaced, and the traffic teleports to wherever the newcomer's fresh simulation put it. The old host quietly stops hosting.
- Cause: Host is purely the lowest id among known players, and the joiner's `known` is filled from the lookup, so a joiner can be `isHost` from its first frame. Its `scores` is `{ [selfId] }` only and it ignores `sb`/`ch`/`kt`/`pk`/`tf` from the old host because it is its own host. Everyone else switches to it when its hello lands. Its first `catchUpLife` on each player's `st` creates `{k:0, d:0, c:0, hp:100, alive:true, life}` and broadcasts `sb`; receivers' `onScores` sees `s.life === this.life` and copies `hp = 100`. Its 10 Hz `ch`/`kt`/`tf` and `pk` then overwrite everyone's world. (The same pattern in the mines is ticket M-03.)
- Fix: Make host depend on who was there first. Add a start time to hello (`{ name, map, t }`, with `t = Date.now()` set once in the constructor), keep it on each `Remote` (`since`), carry it through `lookForGame` → `found`, and make `hostId` the known player with the smallest `(since, id)` (a hello without `t`, from an old page, counts as `since = 0` so old pages keep hosting). Stop-gap if that's too big: when `known.length > 0` in the constructor set `this.synced = false`, accept the first `sb`, `pk`, `ch`, `kt`, `tf`, `vh` from the lowest id in `known` regardless of `isHost`, and only act as host once `synced` or that player has left.

### [ ] C-02 Traffic is silent: its engine and horn code sits inside `busService()`, which runs once a minute on the host
- Severity: high
- Confidence: confirmed
- Where: web/src/game.ts:1438-1452 (engine code at the bottom of `busService`), web/src/game.ts:1430 and 1421 (early returns before it), web/src/game.ts:1627 (`busService` called every `BUS_EVERY` = 60 s, host only), web/src/game.ts:1210-1225 (`engineSounds`, which only walks `vehicles.list`), web/src/traffic.ts:186-189 and 347 (`horn`, `rpm`, `gas` computed for exactly this)
- Player sees: The self-driving traffic makes no engine noise and never leans on its horn when you stand in the road (traffic.ts:2 says it should). Rarely, on the host, one traffic car's engine starts and then drones at a fixed pitch and pan for up to a minute, even after it has driven off.
- Cause: The "nearest few cars in the traffic" engine loop and the "engines whose object has gone" clean-up were put at the end of `busService()` instead of `engineSounds()`. `busService` returns early when there's no idle bus or as soon as it places one, so the code runs only on the host, once a minute, only when every stop search fails; and `engineSounds()` never calls `e.set()` on a traffic engine so it is never updated or stopped.
- Fix: Move game.ts:1423-1437 (from `// the nearest few cars in the traffic` to the `for (const [o, e] of this.engines) …` clean-up) to the end of `engineSounds()`, after the `for (const v of this.vehicles.list)` loop. `busService()` should end after its `for (let tries …)` loop.

### [ ] C-03 Players on a different map in the same room reappear as ghost avatars at their other-map coordinates
- Severity: medium
- Confidence: confirmed
- Where: web/src/game.ts:604-611 (`onHello` puts them in `elsewhere` and removes their avatar), web/src/game.ts:623-633 (`onState` calls `this.remote(from)` with no `elsewhere` check), web/src/game.ts:585-594 (`remote()` creates and adds an avatar), web/src/game.ts:1629-1632 and 1631 (`targets()` and `walkers` include every remote)
- Player sees: Two friends start the same room name on different maps at once. After the "X is in this room on Y, so you can't see each other" toast, a player model for X still appears, standing or floating at X's coordinates read as if they were on this map (often in the air or under the ground), with their name tag, moving as X moves. Chavs can chase the ghost, you can shoot it (and the host will score the hit), footsteps and bloody footprints are drawn for it.
- Cause: `onHello` removes the remote and marks them `elsewhere`, but every one of their 20 Hz `st` packets goes through `onState`, which calls `remote(from)` and re-creates the avatar. Only `peers()` (host election) consults `elsewhere`.
- Fix: At the top of `onState`: `if (this.elsewhere.has(from)) return;`. Also skip them in `onShot` (`remotes.get` already returns undefined after the hello fix, so that's covered) and don't let `sendScores()` (game.ts:1446) create entries for them.

### [ ] C-04 Getting out of a vehicle on a bridge or in a tunnel drops you onto the terrain (the river bed, or the hilltop)
- Severity: high
- Confidence: confirmed
- Where: web/src/game.ts:1091-1092 (`getOut` → `p.spawn(at.x, at.z, p.yaw)`), web/src/player.ts:74-76 (`spawn` uses `map.ground`), web/src/map.ts:303 (`floor(x, z, y)` is what knows about decks and tunnels)
- Player sees: Drive through the Two Tunnels and press E: you pop out on the hillside above the tunnel. Stop on Broad Quay, Pulteney Road or Rossiter Road bridge (or any of the 217 wide-map bridges) and get out: you drop into the river or onto the railway under the deck, with the car left above you.
- Cause: `Player.spawn` sets `pos.y = map.ground(x, z)`, the bare terrain. Decks and tunnel floors only come from `map.floor(x, z, y)`, which needs the current feet height to pick the deck (`best <= y + 0.6`) or tunnel (`y < f + crown - 0.4`). Once under the deck, `floor()` keeps choosing the terrain.
- Fix: In `getOut` after `p.spawn(...)`: `p.pos.y = this.map.floor(at.x, at.z, v.y + 0.5);` (`v.y` is the vehicle's own surface height, so the deck/tunnel test passes). Or give `Player.spawn` an optional `y`.

### [ ] C-05 Traffic drives along the river bed under bridges
- Severity: high
- Confidence: confirmed
- Where: web/src/game.ts:246 (`new Traffic(map, world.scene, (x, z) => world.surface(x, z))`), web/src/traffic.ts:339-343 (`this.ground(x, z)` with no `y`), web/src/world.ts:959-964 (`surface(x, z, y?)` only looks at decks/tunnels when `y` is given)
- Player sees: Cars on Broad Quay and Pulteney Road (primary roads that bridge the Avon in the detailed map) sink 5-7 m as they reach the bridge, drive through the water under the deck and climb out the far side. Same on any bridged road.
- Cause: Without `y`, `surface()` returns `map.ground(x, z) + lift` (river bed + 7 cm). The traffic network includes bridge roads because the class is in `SPEED`.
- Fix: Carry the road's own height. In the `Traffic` constructor store each node's height (`y: p[2] - map.z0`; road points are `[x, y, z]` with absolute z), and in `update()` on the host use `Math.max(this.ground(x, z), lerp(A.y, B.y, c.s / c.e.len))` for `c.y`, or change the callback to `(x, z, y) => world.surface(x, z, y)` and pass the car's last `y`. For non-hosts add `q(c.y)` to the snapshot (`STRIDE` 6 → 7) and lerp it, or seed `c.y` from the first snapshot and call `this.ground(x, z, c.y)` each frame.

### [ ] C-06 Trunk roads and living streets are never drawn: a grassy trench where the A36 and Alexandra Park should be
- Severity: high
- Confidence: confirmed
- Where: web/src/world.ts:191-192 (`RW`, `KERBED`), web/src/world.ts:433-446 (`roadMeshes` only strips `PATHS`, `service`/`unknown` and `KERBED`), web/src/world.ts:922-925 (`paved()` agrees), web/src/map.ts:693 (`roadHalf`), web/src/traffic.ts:16-17; tools side in T-01
- Player sees: In Widcombe the A36/A367 (Lower Bristol Road, Rossiter Road, Claverton Street, Pulteney Road: 24 pieces) and the whole of Alexandra Park road (a `living_street`) have no carriageway, kerbs, pavement or lamps: just a grass groove sunk 0.3 m with the white markings floating 0.4 m above it. Cars on them count as on grass (0.6 top speed, grass footsteps) and no traffic uses them.
- Cause: `combe-down.json` carries roads of class `trunk` (24) and `living_street` (2). They fall through every branch in `roadMeshes`, `paved()` and `roadHalf` (`RW` has `living_street: 5` but no strip is built for it; `trunk` is nowhere), so the terrain is sunk under them but nothing is drawn.
- Fix: Either fix the data (T-01: map `trunk` → `primary`, `living_street` → `residential` in `tools/prep_map.py` like `prep_wide.py` already does, and rebuild) or the game: add `"trunk"` and `"living_street"` to `KERBED` (world.ts:192), `trunk: 9` to both `RW` tables (world.ts:191, map.ts:693) and to traffic.ts `SPEED`/`WIDTH`. Doing both is safest.

### [ ] C-07 Standing on a flat-capped wing past a gable end floats you 1-3 m above the visible roof
- Severity: medium
- Confidence: confirmed
- Where: web/src/map.ts:376-392 (`roofAt`), web/src/world.ts:660-671 (the wing cap is drawn at the eaves)
- Player sees: On the 115 `wings` buildings (footprint sticks out past a gabled end of the roof rectangle), walk off the end of the pitched roof onto the lower flat cap over the wing and you are held in mid-air 1-3 m above it, as if the pitched roof carried on. TODO.md already says the capped wings were only checked in code; this is the collision half of that.
- Cause: `roofAt` computes the pitched height from the distance across the ridge only (`h = ridge - |sv| * slope`) and only clips the ends when hipped (`if (hip0) … if (hip1) …`). For a gabled end there is no limit on `su`, so any footprint point beyond `|su| > L/2` near the ridge line gets height ≈ ridge, while world.ts draws the gable triangle at exactly `L/2` and caps the rest at the eaves.
- Fix: In `roofAt`, after computing `su` (and moving `const [hip0, hip1] = b.hp ?? [0, 0];` above it), add `if ((!hip0 && su < -L / 2) || (!hip1 && su > L / 2)) return eave;`.

### [ ] C-08 Chavs, rugby lads and cricketers all march to the map centre after a host handover
- Severity: medium
- Confidence: confirmed
- Where: web/src/chavs.ts:264-267 (host-only fields default 0), web/src/chavs.ts:594-611 (`apply()` copies only `gen, x, y, z, yaw, hp, punches, look, target`), web/src/chavs.ts:398-405 (`move()` walks home), web/src/chavs.ts:364-372 (`think()` uses `baseX/baseZ`)
- Player sees: When the host leaves and the next player takes over, every chav not mid-chase stops loitering and walks in the same direction, towards scene (0,0), at 2 m/s; teams head for whoever is nearest the map centre instead of their pitch; chasing chavs sprint towards the centre for up to 3.5 s before giving up. Most then vanish once they're 170 m from everyone.
- Cause: `homeX/homeZ`, `baseX/baseZ`, `lastX/lastZ` are only set in `gather()`/`think()` on the host; a non-host's `apply()` never fills them, so on the new host every live chav has them at 0 and `move()` heads for `(0,0)`.
- Fix: In `Chavs.apply()`, inside the `if (gen !== c.gen)` branch, add `c.homeX = c.baseX = c.lastX = x; c.homeZ = c.baseZ = c.lastZ = z;`.

### [ ] C-09 A remote player snaps upright for a frame as they die
- Severity: low
- Confidence: confirmed
- Where: web/src/game.ts:632 (`r.avatar.alive = alive === 1` unconditionally), web/src/game.ts:695-696 (kill event sets `alive = false`), web/src/avatar.ts:306-316
- Player sees: Kill someone and their body starts to fall, snaps back upright with the name tag showing for a frame, then falls again from the start.
- Cause: The host's `kill` event lands before the victim's last `st` packets that still say `alive = 1`; `onState` revives the avatar until the next `st` says 0.
- Fix: Keep `r.deadLife = r.life` in the kill handler and in `onState` use `r.avatar.alive = alive === 1 && life !== r.deadLife`.

### [ ] C-10 The host redraws every remote's name-tag texture every two seconds
- Severity: low
- Confidence: confirmed
- Where: web/src/game.ts:1682-1687 (non-hosts hello the host every 2 s), web/src/game.ts:615-618 (`onHello` always calls `setName`), web/src/avatar.ts:272-275 (`setName` disposes and redraws a canvas texture)
- Player sees: Nothing directly; on a phone or iPad hosting a full room it's a 256×64 canvas draw and texture upload per player every 2 s, forever.
- Fix: In `onHello`, only redraw when the name changed: `if (r.name !== name) { r.name = name; r.avatar.setName(name, r.colour); }` (keep the `isNew` feed logic).

### [ ] C-11 Hand-made landmarks apart from the oak have no collision
- Severity: low
- Confidence: confirmed
- Where: web/src/map.ts:268-269 (only `oak` gets a post), web/src/landmarks/spire.ts, portico.ts, bridge.ts
- Player sees: You walk and shoot straight through Holy Trinity's tower, the six columns of each Prior Park portico and the Palladian bridge's piers.
- Fix: In the same loop add solids per kind: `portico` ([w, h] args) six `addPost` at the column positions (local x = -w/2 + 0.8 + k * (w - 1.6) / 5, local z = 4.8, turned by `ang`) plus an `addBox` for the podium; `spire` an `addBox(x, y, ang, 0, s/2, s/2, g + towerH)`; `bridge` an `addBox(x, y, ang, 0, 9, 3.2, g + 3)` for the base.

### [ ] C-12 Minimap paints playground cells in the wrong colour
- Severity: low
- Confidence: confirmed
- Where: web/src/minimap.ts:41-51 (six-entry `GROUND`), web/src/world.ts:180-189 (eight kinds), web/src/minimap.ts:148 (`paintWide` already has eight)
- Player sees: The 644 playground cells (kind 7) on the minimap and full map show in whatever colour was drawn just before them (pitch green, meadow, hard standing) as odd blotches.
- Cause: `GROUND[7]` is `undefined`; the canvas ignores the assignment and keeps the previous `fillStyle`.
- Fix: Give the constructor's palette the same eight entries as `paintWide()` (or hoist one shared palette).

### [ ] C-13 Pub hanging signs squash the name into unreadable stripes
- Severity: low
- Confidence: confirmed
- Where: web/src/furniture.ts:286-300
- Player sees: The swinging board outside each pub shows the name as a smear of tall thin strokes.
- Cause: The 8-13:1 fascia texture (`fasciaTexture(name, style, 1024, round(1024 * 0.62 / w))`) is reused on the ±x faces of a `BoxGeometry(0.06, 0.95, 0.8)`, squeezing it ~10-15× horizontally.
- Fix: Make a board-aspect texture: `fasciaTexture(name, style, 512, Math.round(512 * 0.95 / 0.8))` and use it on the board's two faces.

### [ ] C-14 Touch crouch button stays lit after getting into a vehicle
- Severity: low
- Confidence: confirmed
- Where: web/src/touch.ts:280 (toggles the class itself), web/src/game.ts:1078 (`p.crouchLatch = false` on getting in), web/src/game.ts:1783-1784 (aim/bino are re-synced every frame, crouch isn't)
- Fix: Add `$("t-crouch").classList.toggle("latched", p.crouchLatch);` next to the aim/bino lines.

---

## Under Combe Down (the mines)

### [ ] M-01 A mini-boss death silently kills the key-carrying champion, so the key puzzle can't be solved
- Severity: high
- Confidence: confirmed
- Where: web/src/mines/game.ts:509-514 (the death cascade sets `s.state = 3` directly), web/src/mines/puzzles.ts:1068-1075 (`dropKey` only via the normal kill path, and only while `s[1] === 0`), web/src/mines/gen.ts:768-776 and 899-913 (the key champion can be placed in the exit room)
- Player sees: On a "bring the foreman's key to the gate" level, if the champion with the key is within 14 m of the winze mini-boss when it dies, the champion dies too and no key appears. The grille never opens; the party is stuck until everyone dies on purpose.
- Cause: `for (const s of this.horde!.sims) if (s !== m && s.state !== 3 && dist < (m.mini ? 14 : 24)) { s.state = 3; s.hp = 0; }` bypasses `else if (m.champ) this.puzzles?.dropKey(...)`. It's likely, not rare: `free` still contains the exit room (`order[0]`, only filtered for `boss && k === 1`) and `key` picks `takeRoom()` with no preference, so the champion is often placed next to the mini-boss, and it chases players into that fight anyway.
- Fix: In the cascade loop, before `s.state = 3`: `if (s.champ) this.puzzles?.dropKey(this.W.ps, s.x, s.z, this.hostCtx);` (and emit a `kill` event for each so everyone hears it). Also exclude the exit room from the key's `takeRoom()` the way `levers` does (`takeRoom((a) => a !== exitRoom)`).

### [ ] M-02 After a host handover, the next player to join duplicates every monster on the level
- Severity: high
- Confidence: confirmed
- Where: web/src/mines/game.ts:141 (`spawned`), web/src/mines/game.ts:298 (only filled in `startHorde`), web/src/mines/game.ts:530-537 (takeover builds the horde from `lastMobs` but never fills `spawned`), web/src/mines/game.ts:211 and 304-311 (`onJoin` → `reinforce()` pushes a sim for every spawn not in `spawned`), web/src/mines/game.ts:960 (`syncMobs` keys by id)
- Player sees: Once the original host has left and someone else hosts, the moment another player joins every monster on the level, including dead ones and the mini-boss, appears again at its spawn point. Duplicates share ids with the originals, so the drawn monster jitters between two places every frame, hits land on the wrong one, and a dead mini-boss is alive again.
- Fix: In the takeover branch after `unpack`, set `this.spawned = new Set(sims.map((s) => s.id).filter((id) => id < this.L!.spawns.length))`. Make `reinforce()` defensive too: `if (this.horde.sims.some((m) => m.id === s.id)) continue;`.

### [ ] M-03 A newcomer with a lower id can reset the horde to its spawn points
- Severity: medium
- Confidence: confirmed
- Where: web/src/mines/game.ts:263-270 (`hostId` ties on `born` broken by id), web/src/mines/game.ts:338-340 and 416 (`applyWorld` → `buildLevel` ends with `if (this.isHost) this.startHorde()`), web/src/mines/game.ts:202 (`lastMobs` only recorded while `from === hostId && !isHost`), web/src/mines/game.ts:530-538
- Player sees: Mid-fight, when a friend joins, every monster is suddenly back where it started at full health, dead ones alive again. Happens for some joins only.
- Cause: When host A's `mw` reaches newcomer C, `applyWorld` copies A's `born`, so the tie goes to the lower id; if that's C, `buildLevel` starts a fresh horde. If A's `mw` (1 Hz) reaches C before any `mob` (10 Hz) or before A's first `st`, `lastMobs` is empty or `wasHost` is already true, so the takeover-from-old-list path never runs, and A stops simulating because it now sees C as host.
- Fix: Don't let a newcomer win the tie: put the host's id in `World` (`W.host`) and prefer it when `born` ties; or remove `if (this.isHost) this.startHorde()` from `buildLevel` for worlds that came over the network (only the host's own `newRun`/`down` paths should start a horde) and record `lastMobs` from any `mob` whose sender has `run > 0` regardless of `isHost`. (Same family as C-01.)

### [ ] M-04 The "push the stone" block has no collision for non-hosts, nor for the host until first pushed
- Severity: medium
- Confidence: confirmed
- Where: web/src/mines/puzzles.ts:199-209 (`sync` only moves the model), web/src/mines/puzzles.ts:875-877 and 1033-1035 (`setSolid` only in host-only `use()`/`tick()`), web/src/mines/level.ts:246-249 (build-time solids don't include it)
- Player sees: You (and monsters) walk straight through the 1.7 m stone block; the host can too until it has been pushed once.
- Fix: In the block case's `sync`, keep the solid cell in step with state: `if (cur) this.level.setSolid(cur.i, cur.j, false); cur = { i: s[1], j: s[2] }; this.level.setSolid(cur.i, cur.j, true);` (declare `let cur: {i:number;j:number}|null = null` next to `at`).

### [ ] M-05 With a typed seed, a wiped run restarts without rebuilding the level
- Severity: medium
- Confidence: confirmed
- Where: web/src/mines/game.ts:275-281 (`newRun` reuses `opts.seed`/`opts.depth`), web/src/mines/game.ts:354-355 and 392 (level key is `seed:depth` only), web/src/mines/puzzles.ts:333-344 (secret door keeps `sink`)
- Player sees: Playing a mine by seed, after the whole party is down the "fresh run" starts with everyone standing where they died, next to the respawned monsters, the map still explored, and a previously opened secret door invisible but solid again.
- Cause: `applyWorld` only rebuilds when `${W.seed}:${W.depth}` changes, so a new run on the same seed skips `buildLevel` (which spawns the player, resets `seen` and recreates `PuzzleSet`).
- Fix: Include the run in the key: `` `${W.run}:${W.seed}:${W.depth}` `` at both places (354 and 392), or set `this.levelKey = ""` inside the `if (W.run !== this.myRun)` block.

### [ ] M-06 Monsters "kept back for a bigger party" never turn up when someone joins
- Severity: medium
- Confidence: confirmed
- Where: web/src/mines/game.ts:208-212 (`reinforce()` from `onJoin`), web/src/mines/game.ts:261 and 284 (`partySize` counts only `known`), web/src/mines/game.ts:902 (`known` gains the newcomer on their first hello/st), web/src/net.ts:113-117 (`onJoin` fires before any message)
- Player sees: A friend joining partway down adds no monsters; the `need: 2/3/4` spawns only appear on the next level.
- Fix: Call `this.reinforce()` from `remote()` when a new `Remote` is created (or from `onHello` when `isNew`) instead of, or as well as, in `onJoin`.

### [ ] M-07 Monsters never groan when killed
- Severity: low
- Confidence: confirmed
- Where: web/src/mines/game.ts:644-646 (`onEvent("kill")` sets `m.state = 3` first), web/src/mines/game.ts:973 (`syncMobs` groans only on a state change it sees)
- Fix: Play the groan in `onEvent("kill")` (`const pan = this.panTo(m.x, m.z); SFX.groan(pan.d, pan.p, d.id);`) or don't set `m.state = 3` there and let `syncMobs` do it.

### [ ] M-08 The wipe countdown is frozen for everyone but the host
- Severity: low
- Confidence: confirmed
- Where: web/src/mines/game.ts:562-565 (`wipeT` advanced in `hostUpdate` only), web/src/mines/game.ts:1537 (HUD shows it for everyone)
- Fix: Show `Math.ceil(WIPE_WAIT - (Date.now() - W.end) / 1000)` from the shared `W.end` (and compare the same in `hostUpdate` so host and clients agree).

### [ ] M-09 Tramway rails run at one height through stepped headings
- Severity: low
- Confidence: confirmed
- Where: web/src/mines/level.ts:541-549 (one `y` for the whole run), web/src/mines/gen.ts:1297-1299 (runs of 5+ cells), web/src/mines/gen.ts:658-676 (`relax()` gives cells their own floor)
- Player sees: Rails float at one end of a long heading and sink into the floor at the other.
- Fix: In gen.ts:1297 only add rails to runs whose cells share one `fl`, or split the run into same-height segments with one `rails` prop each.

### [ ] M-10 `?class=` (or any refused first pointer lock) leaves the mouse uncaptured for the session
- Severity: low
- Confidence: confirmed
- Where: web/src/mines/main.ts:81 (`lock()` called without a gesture when `CLASS` is set), web/src/mines/main.ts:119-137 (`lock()` returns early forever once `freeLook`), web/src/mines/main.ts:157
- Fix: Give `lock(fromClick = false)` and skip the `freeLook` early return when `fromClick`, resetting `game.freeLook = false` and the cursor on success. For `?class=`, call `resume()` and show "Click to play" instead of `lock()`.

### [ ] M-11 A host change right after climbing down can revive the previous level's monsters
- Severity: low
- Confidence: confirmed
- Where: web/src/mines/game.ts:377-394 (`buildLevel` resets `horde` but not `lastMobs`), web/src/mines/game.ts:532-535 (takeover trusts `lastMobs.length`)
- Fix: Add `this.lastMobs = [];` in `buildLevel` next to `this.horde = null`.

### [ ] M-12 Staggering the Owner's Ghost mid-curse leaves its glowing curse mark hanging in the air for the rest of the level
- Severity: medium
- Confidence: confirmed
- Where: web/src/mines/bossfx.ts:96 (`add()` excludes sprites from the cancellable list), web/src/mines/bossfx.ts:85-92 (cancel), web/src/mines/bossfx.ts:347-349 and 365 (the mark is a `Sprite`, removed only on normal completion), web/src/mines/bosses.ts:57 (stagger sends `cancel` during a wind-up)
- Player sees: A weakness hit on the Owner's Ghost during its 0.8 s curse wind-up removes the floor rings but leaves the bright green sprite 2.6 m over the cursed player's head, glowing until the next level. Each such stagger adds another.
- Fix: In `curse()` set `mark.userData.tell = true` and change line 96 to `!(o as THREE.Sprite).isSprite || o.userData.tell`; dispose `sm` on the cancel path too (see M-16).

### [ ] M-13 The Owner's Ghost dies fully solid, then pops out
- Severity: low
- Confidence: confirmed
- Where: web/src/mines/mobviews.ts:3344-3345 (`if (!this.dying) for (const f of this.fades) f.m.opacity = f.a * lit`), web/src/mines/mobviews.ts:147 (generic dying fade overwrites it, `FADE_AT.owner = 3.4`)
- Fix: Drop the `!this.dying` guard and multiply (`f.a * lit * this.fade`), and skip the generic fade for kinds that handle their own (a `customFade` flag), or move line 147 above the `this.anim(...)` call.

### [ ] M-14 Dead bats and gazers keep bobbing through the floor
- Severity: low
- Confidence: confirmed
- Where: web/src/mines/game.ts:1316 (`def.fly ? g + 1.4 + sin(...) * 0.25` with no `state` check), web/src/mines/mobviews.ts:558 and 1280
- Fix: `const y = def.fly ? (m.state === 3 ? g + 1.4 : g + 1.4 + Math.sin(this.clock * 3 + m.id) * 0.25) : …`.

### [ ] M-15 Crossbowman IK and the centipede allocate ~30 vectors a frame each
- Severity: low
- Confidence: confirmed
- Where: web/src/mines/mobviews.ts:1445-1458 (`ik()` clones), 2713-2716 (fresh pole vectors per call), 1469-1474 (`rodTo`), 1925 (centipede `pts.map(p => p.clone())`)
- Player sees: Periodic GC hitches on phones in rooms with a few crossbowmen or a centipede.
- Fix: Hoist module-level scratch vectors/matrix and rewrite with `copy()`/`subVectors()`; make the two poles constants; keep a preallocated `loc[]` for the centipede.

### [ ] M-16 Cancelled or cleared boss telegraphs never dispose geometry and materials
- Severity: low
- Confidence: confirmed
- Where: web/src/mines/bossfx.ts:85-92 (cancel only `remove`s), 386-391 (`clear()` likewise), 54-60 (`drop()` disposes properly)
- Fix: Add a `junk(o)` helper that traverses and disposes geometry/material except the shared `spikeGeo`/`ledgerGeo`/`blockGeo` and their materials; call it from the cancel loop and `clear()`.

### [ ] M-17 The default dust floor shows a faint seam grid every 2 m
- Severity: low
- Confidence: confirmed
- Where: web/src/mines/art.ts:47-62 (`floor()` draws pebbles and grit with bare `fillRect`, not `wrapAt()`), web/src/mines/art.ts:605-608, web/src/mines/level.ts:370
- Fix: Rewrite `floor()` on the shared canvas with `base()` for grit and `wrapAt(...)` for each pebble, like the newer styles. (`rock()` at art.ts:6-44 has the same issue but is no longer used by level.ts.)

---

## Audio and music

### [ ] A-01 A sniper shot within 0.3 s of moving the music slider drags the volume back
- Severity: low
- Confidence: confirmed
- Where: web/src/audio.ts:334-338 (`sniperShot` schedules a return to the old `musicVolume`), web/src/audio.ts:140-143 (`setMusicVolume` doesn't cancel it)
- Fix: In `setMusicVolume`: `music.gain.cancelScheduledValues(ctx.currentTime);` before `setTargetAtTime`.

### [ ] A-02 The now-playing clock keeps counting while the music is muted
- Severity: low
- Confidence: confirmed
- Where: web/src/nowplaying.ts:40-42, web/src/audio.ts:134 (`trackTime` is wall-clock since track start), web/src/audio.ts:79 (sequencer pauses when muted), web/src/audio.ts:73-77 (`trackStart` is 0 before the first track)
- Fix: Keep a `playedTime` accumulator advanced in `tick` only while unmuted, reset it in the `onTrack` timeout, and show `00:00` before the first track.

---

## Map-building tools (`tools/`), where they change what players see

### [ ] T-01 `prep_map.py` passes `trunk`, `living_street` and `pedestrian` through, which the game can't draw
- Severity: high
- Confidence: confirmed
- Where: tools/prep_map.py:171 (`c = p.get("class") or "unknown"`), tools/prep_map.py:143-145 and 186 (terrain flattened under them anyway), tools/streets.py:22 (`vehicle` set leaves them out, so no lamps/signs), tools/prep_wide.py:266-267 (already maps `trunk` → `primary` with the comment "the game knows these classes")
- Player sees: C-06 (the A36 in Widcombe and Alexandra Park are a grassy trench; four short `pedestrian` streets in the city centre are missing).
- Fix: In `prep_map.py` add `CLASS = {"motorway": "primary", "trunk": "primary", "living_street": "residential", "pedestrian": "service"}` and use `CLASS.get(c, c)` at line 171; add the `living_street`/`pedestrian` entries to `CLASS` in `prep_wide.py:267`; make `streets.py:22` include whatever trunk becomes. Rebuild the map. (C-06 has the game-side alternative; doing both is safest.)

### [ ] T-02 A house split into roof-level parts is classed as a semi or terrace (its own extension counts as a neighbour)
- Severity: medium
- Confidence: confirmed
- Where: tools/prep_map.py:252-263 (parts replace the whole footprint in `cand`), tools/buildings.py:50-79 (`groups()` built from the parts), tools/buildings.py:297, 308-309, 322, 328-333
- Player sees: Detached houses with a single-storey extension become "semis" (e.g. Cedar Park: a 325 m² part and a 37 m² part, both `semi`), two extensions make a "terrace": chimneys on the internal wall between house and extension, no gable overhang, front doors in an end bay (sometimes a second door on the extension), shorter gardens, and a lidar-split shop can never be a `shop` (`size == 1` rule at line 322) so it gets a house's door and fences instead of a shopfront. At least 24 houses, 15 inside the field.
- Cause: `area = p.get("_whole") or poly.area` shows parts were meant to be judged as the whole building, but `size` from `groups()` wasn't given the same treatment.
- Fix: In `buildings.groups`, skip pairs sharing the same original footprint (pass `props` in; `continue` when both have the same `_whole_geom`; `prep_wide.py:186` needs to store it too). Keep that adjacency out of `adj` so the chimney loop (line 499) doesn't see it.

### [ ] T-03 Lidar-measured semis are hipped at the party-wall end
- Severity: medium
- Confidence: confirmed
- Where: tools/lidar.py:133 (`hips=(hipped, hipped)` always present), tools/buildings.py:439-449 (`if "hips" in m:` always taken; the `elif m["hipped"]` branch with the semi correction is dead)
- Player sees: About 4% of semi pairs (53 of 1344, e.g. buildings 153/154 near [-1804, 629], both `hp: [5.2, 5.2]`) have each half's roof sloping down towards its neighbour: a V valley over the party wall with the neighbour's roof poking through.
- Fix: Apply the party-wall correction after either branch (for `kind == "semi" and walls`, zero the hip on the party-wall side using the existing `s_wall` test), or have `lidar.measure` only set `hips` when `fit` succeeded.

### [ ] T-04 Shrubs stop 1060 m from the map centre, well inside the field
- Severity: medium
- Confidence: confirmed
- Where: tools/landscape.py:98 (`math.hypot(x, y) > 1060`)
- Player sees: Shrubs vanish along a circle about 1 km from the Hadley Arms; Lyncombe Vale, Bear Flat and Widcombe have trees and hedges but not one shrub (24,835 shrubs in the JSON, furthest at 1059.9 m; the field reaches 1875 m NW).
- Fix: Drop the `hypot > 1060` test (the `inside` test already limits to the data box), or measure from the field centre with `A.field + 60`.

### [ ] T-05 Shrubs on pavements
- Severity: low
- Confidence: confirmed
- Where: tools/landscape.py:85-87 (road buffer is carriageway only), web/src/world.ts:443 (`PAVE` 1.7 m)
- Player sees: 397 bushes growing out of pavements along kerbed streets.
- Fix: Use `RW.get(c, 3) / 2 + (1.7 if c in KERBED else 0) + 0.6` for the buffer, like trees do (prep_map.py:406-408).

### [ ] T-06 Tree trunks in footpaths
- Severity: low
- Confidence: confirmed
- Where: tools/prep_map.py:406-408 (verge displacement only for non-`PATHS` roads), 414-426
- Player sees: 523 trunks (solid collision cylinders) in 1.4-1.8 m footways and steps, so you squeeze round them.
- Fix: Include paths in `street_lines` with `w = RW.get(c, 3) / 2` so trunks are pushed to `w + 0.8` beside the path; keep the second query so a trunk moved onto another path is dropped.

### [ ] T-07 Items float or sink where the tool's ground height differs from the game's
- Severity: low
- Confidence: confirmed
- Where: tools/prep_map.py:198-203 (`gelev` is bilinear), tools/prep_wide.py:106-111, web/src/map.ts:437-447 (`ground` splits each cell into two triangles)
- Player sees: On steep cells a tree by Prior Park at [-21.5, 851.0] hangs 2.9 m in the air; a lamp post at [-533.87, 1611.6] is 1.1 m under the ground; 177 of 9750 street items and 63 of 41,801 trees are off by more than 10-20 cm.
- Fix: Make `gelev` use the game's split: `if u + v <= 1: g[j,i] + (g[j,i+1]-g[j,i])*u + (g[j+1,i]-g[j,i])*v else g[j+1,i+1] + (g[j+1,i]-g[j+1,i+1])*(1-u) + (g[j,i+1]-g[j+1,i+1])*(1-v)`.

### [ ] T-08 Street furniture on pavements sits 20 cm into the paving
- Severity: low
- Confidence: confirmed
- Where: tools/streets.py:51 (stores bare `gelev`), web/src/world.ts:443 (pavement drawn at ground + 0.2), web/src/furniture.ts:123-126 (placed at the stored height)
- Player sees: Bench seats low, a 0.9 m bollard showing 0.7 m, bin and lamp bases buried.
- Fix: Place furniture at `world.surface(x, -y)` in `furniture.ts` (cleaner, since the lift is a drawing decision), or add 0.2/0.07 in `streets.py` for pavement/carriageway items.

### [ ] T-09 Road widths differ between the tools and the game, so parked cars overhang the kerb
- Severity: low
- Confidence: confirmed
- Where: tools/prep_map.py:143-145 (`RW`: primary 9, unclassified 6, path 1.5, track 3), tools/streets.py:172, web/src/world.ts:191 and web/src/map.ts:693 (8.5, 5.5, 1.4, 2.8)
- Player sees: 620 of 622 parked cars on unclassified streets have their kerbside wheels 8 cm up on the pavement with the kerb face through the car; give-way dashes on primaries end under the pavement.
- Fix: Make `prep_map.py` `RW` match the game's (and leave a comment on both tables to keep them in step), then rebuild.


---

## COMBE DOWN WITH ME (the deli kitchen)

New this afternoon, so expect rough edges. Host choice and handover, the grab races, the door both ways,
touch, 1-4 cooks and the camera maths were all traced and are fine (see the end of this file).

### [ ] D-01 No voice chat in the deli kitchen
- Severity: medium
- Confidence: confirmed
- Where: web/src/deli/game.ts (never imports `../voice`), web/src/deli/main.ts:88; compare web/src/mines/game.ts:19, 190, 210, 217, 1334
- Player sees: Friends chatting on the street walk through the deli door together and voice goes dead for the whole shift; it comes back when they step out. There's no mute on the pause card either. The deli room is a real Trystero room with `media: true`, so the links are there; nothing listens.
- Cause: `DeliGame` never creates a `Voice`, so `net.onStream` is never set and incoming mic streams are dropped; no `voice.join`/`drop` on join/leave; no `voice.update` per frame; `st` carries no talk state.
- Fix: As the mines do: `readonly voice = new Voice(net, (t, s) => this.toast(t, s))`; `this.voice.join(id)` in `net.onJoin`, `this.voice.drop(id)` in `net.onLeave`; in `update()` call `this.voice.update(cam.x, cam.y, cam.z, fwd.x, fwd.y, fwd.z, (id) => { const r = this.remotes.get(id); return r ? { x: r.x - W / 2, y: 0.8, z: r.y - H / 2 } : null; })` (the kitchen is 12 tiles across, inside `NEAR_REF`, so everyone is at full volume, which is right for a kitchen); `this.voice.dispose()` in `dispose()`; send `voice.mode` in `st` and call `voice.heard(from, mode)` on receipt; a Mute button on the pause card wired to `voice.mute()`; hold V for the radio like the other pages. Skip when `net.kind === "local"` (`voice.available`).

### [ ] D-02 A slow frame while pushing against a counter puts the cook inside it, for good
- Severity: medium
- Confidence: confirmed
- Where: web/src/deli/game.ts:257-271 (`slide`), 240-241, 246-251 (cook-vs-cook push), web/src/deli/main.ts:180 (`dt` capped at 0.1)
- Player sees: On a stuttering phone (any frame of 90 ms or more) a cook walking into a counter ends up standing in the middle of it and can never walk out; the only way back is to reload. The bump-apart between two overlapping cooks can shove you into a counter the same way.
- Cause: `slide` resolves a blocked move from the tile the *centre* landed in, not the tile the leading corner hit: `const i = Math.floor(x); return x > this.x ? i + 1 - RADIUS - 0.001 : …`. With `SPEED = 3.4` and `dt` up to 0.1 the centre moves 0.34 tiles in a frame, more than the `RADIUS = 0.3` gap to the corner, so `Math.floor(x)` can be the counter tile itself and the "resolved" position is inside it. Every later `slide` is then blocked and returns another inside position. The push at 246-251 can shove by up to 0.6 in one go.
- Fix: Resolve against the leading edge: `const edge = x > this.x ? Math.floor(x + RADIUS) : Math.floor(x - RADIUS)` and return `x > this.x ? edge - RADIUS - 0.001 : edge + 1 + RADIUS + 0.001` (same for Y), never returning a value past the wall from `this.x`. Also sub-step `move` while `Math.hypot(vx, vy) * dt > 0.25`, and clamp the bump push to `Math.min(push, 0.2)`.

### [ ] D-03 Food goes on burning (with the alarm) after the kitchen has closed
- Severity: low
- Confidence: confirmed
- Where: web/src/deli/kitchen.ts:156-176 (`tick`), 102 (`use` refuses grabs in `ph === 3`)
- Player sees: On the "Kitchen closed" results card the burning alarm goes off and "Something's burning!" pops over the stars, sometimes more than once, and nobody can bin it.
- Cause: `tick` returns early only for `ph === 1`; the chopping and cooking loops run in every other phase, including 3, and only `if (S.ph !== 2) return;` at line 176 stops the clock and orders.
- Fix: After the `ph === 1` block at the top of `tick`, add `if (S.ph === 3) return;` (`begin()` wipes the counters anyway). Optionally skip the oven glow and smoke in the view when `ph === 3`.

### [ ] D-04 Every ticket re-pins itself whenever one order changes
- Severity: low
- Confidence: confirmed
- Where: web/src/deli/game.ts:326-333 (`hud()` rebuilds `$("tickets").innerHTML`), web/src/deli/deli.css:136-138 (`.ticket { animation: pin … }`)
- Player sees: When an order is served, times out or arrives, every ticket along the top drops in again with the swing animation and its wait bar snaps to full for a moment, as if all the orders were replaced.
- Fix: Diff instead of rebuild: remove `.ticket[data-id]` elements whose id is gone, `insertAdjacentHTML("beforeend", …)` only for new ids (keep `ticketKey` as the cheap change check), and set the `<i>` width inline from `o.t / o.T` so a new ticket starts at the right length.

### [ ] D-05 The tile highlight z-fights with the hob's black base
- Severity: low
- Confidence: confirmed
- Where: web/src/deli/view.ts:276 (hob base `cyl(0.34, 0.34, 0.02, 20)` at `TOP + 0.01`), 333, 430 (`face()` puts the highlight `box(1.02, 0.02, 1.02)` at `TOP + 0.01` too)
- Player sees: Facing a hob, the white highlight square flickers and speckles over the hob's dark base.
- Cause: Two coplanar top faces at `TOP + 0.02`; the highlight is transparent with `depthWrite: false` and drawn after.
- Fix: In `face()`: `this.facing.position.y = t === "X" ? 0.86 : t === "H" ? TOP + 0.1 : TOP + 0.011` (the pan rim tops out at `TOP + 0.09`), or give the highlight `polygonOffset: true, polygonOffsetFactor: -2`.

### [ ] D-06 Order tickets wrap to a second row and cover the far end of the kitchen on a phone held upright
- Severity: low
- Confidence: unconfirmed
- Where: web/src/deli/deli.css:132, 203-206; web/src/deli/main.ts:28-29 (`band = innerHeight <= 500 ? 70 : 118`)
- Player sees: In portrait with three or four orders up, the tickets wrap and sit over the boards and hob along the far wall.
- Cause: The camera is fitted below a fixed band that allows one row; on a 390 px screen the rail is 282 px wide, two 96 px tickets fit per row, so `MAX_ORDERS = 4` makes two rows (~135 px) against a 118 px band.
- Fix: Measure instead of guessing: after rebuilding the rail (and in `resize()`) read `$("tickets").getBoundingClientRect().bottom` and refit when it changed; or make `.ticket` 72 px (icons only) in portrait so four fit in one row.

### [ ] D-07 Typing the party name on the front page never finds friends who are in the deli
- Severity: low
- Confidence: confirmed
- Where: web/src/main.ts:357-362 and 370-391 (the lookup listens in `code` and `MINES-${code}` only), web/src/deli/main.ts:14 (the deli room is `DELI-${code}`)
- Player sees: Three friends go into the deli; the fourth types the party name and gets "You've started CODE" in an empty street with no hint the others are cooking. Had they gone down the mines the lookup would have offered to take them there.
- Fix: In `play()` open a third probe `const kitchen = UP ? null : connect(\`DELI-${code}\`, LOCAL)` with `kitchen?.on("hello", (d, from) => { if (d?.deli) cooks.set(from, name) })`, leave it with `below`, and when `!found && cooks.size` offer "X and Y are in the deli kitchen" with a button to `deli.html?go=1&room=CODE&map=…`, mirroring the mines branch at main.ts:383-391. (Note V-04: probes make the players inside renegotiate; the deli has no voice yet, so it's cheap there.)


---

## Checked and found fine

So nobody re-checks them. These looked suspicious and were traced to the end.

**Voice and net**
- Streams that arrive before the game exists are kept per peer in `TrysteroNet.streams` and replayed when `Voice` sets `onStream`; `SFX.unlock()` runs in `start()` before `new Game`, so `SFX.context()`/`voiceOut()` are set when `Voice.hear` runs. (This is Spencer's 16:07 fix; it holds.)
- Mic tracks reach everyone: `askForMic` adds the stream to all present peers once it resolves; `voice.join(id)` adds it to each later joiner; a peer joining while `getUserMedia` is pending is covered by the no-target `addStream` when it resolves. Trystero's `iterate()` only targets active (handshaken) peers, and per-peer stream metadata is paired with `ontrack` in order (one audio track per stream, so nothing crosses).
- Simultaneous `addTrack` on both sides (the usual join case) is handled by Trystero's rollback/ignore logic in `peer.mjs` `signal()`; the browser re-fires `negotiationneeded` after rollback.
- Muting sets `track.enabled = false` (silence frames, connection kept), so unmuting is instant. The radio key is released on pause and on window blur; the touch Radio button releases on `pointerup` and `pointercancel`.
- `Voice.dispose()` stops the mic and is called from `Game.dispose()` on Leave, going down the mine and into the deli; the page then reloads, so listeners don't stack.
- `MESSAGE_TYPES` matches use: every name sent has a handler and every handled name is listed (including `dk`/`dg` for the deli). `ver` is handled inside net.ts by overriding the action's `onMessage`, so `net.on("ver")` would never fire, but nothing calls it.
- Version maths: `BUILD` is `Date.now()` at build time, the 60000 tolerance is one minute, the "newer"/"behind" directions are right, and `version.json` is fetched relative to `BASE_URL` so it works from `index.html`, `mines.html` and `deli.html`. In `vite dev` the fetch gets `index.html`, `r.json()` throws and is caught.
- Trystero's own ICE handling: trickle ICE, candidates queued until the remote description is in, a 5 s grace on `disconnected` before `close`. Nothing to fix there.

**Match**
- Avatar interpolation (110 ms behind 20 Hz sends, snap when >8 m), `teleport()` on respawn, respawn resets (hp, alive, weapon, aim, boost, binoculars, claimed, life, blood, ride), and stale `dmg`/`kill`/`pick` filtering by `life` are all sound.
- Host handover when the host *leaves* works: the new host already holds the latest `sb`, `pk`, `ch`, `kt`, `tf`, `vh`; `Pickups.apply` arms the slot timers; `driveDeliveries` clears orphaned `@` drivers. The one loss is a bus you had called (green dot goes, no "here" toast): cosmetic.
- `vehicles.list[this.myBus]` indexes by id, which only holds for vehicles built at start, but buses always are.
- `Player.update` divides by `dt`; `dt` is capped at 0.05 and only 0 on identical rAF timestamps, which browsers don't produce.
- `[hidden] { display: none !important }` is global so every HUD toggle works; the bus-menu buttons inside `#usehint` have `pointer-events: auto` and touch.ts wires them.

**World and map**
- `GameMap.ground()`'s triangle split matches the terrain mesh and the outskirts; the detailed/wide seam was checked against the data (shared vertex heights match exactly, `(nx-1) % 3 === 0`).
- Scene Z = -north is consistent across map.ts, world.ts, tunnels.ts, vehicles.ts (seat/exit/`a` convention), traffic.ts (`miter`, `place`), outskirts.ts, furniture rotations, tunnel faces and lamps, and the minimap (rotation, north marker, full-map offsets).
- Vehicle ids never clash (parked `base + k`, traffic `100000 + n`); `Vehicles` placement is deterministic across peers (seeded RNG, data order, no tiles loaded at build time). `onVehicles`/`applyEnter`/`applyExit`/`vs` seat handling and host handover trace correctly.
- Tunnels: portals inside the data box, floors straight between portal grounds, `inTunnel` collision agrees with the mouth shader's hole.
- Cats: smoothing, host guards, hop collision at y + 1.1, `c.y = ground + hop` every frame, stuck detection; `BREED_ODDS`/`COATS` both have 10 entries and looks are seeded so every screen draws the same cat. On a new host the `fury` map is empty, so shooting a cat re-triggers the "ALL the cats" toast: minor.
- Sport: pitch frame maths, scoring direction, cricket targets, `STUMPS` keys, bail rest height; broadcast camera and slow motion; pitch line lifts and offsets.
- Trees (LOD capacity, padded bounding spheres), grass (cell choice vs fade), cull.ts (every instanced mesh has a bounding sphere), post.ts (`?fx=0`, `?res=full`, resize order), neon, blood atlas and footprint heading maths, textures.ts wrap modes, posh.ts.

**Mines**
- Level generation is deterministic: no `Math.random`/`Date.now` in gen.ts, level.ts, puzzles.build or props.ts; all `Set`/`Map` iteration is insertion-ordered and built identically on every peer. `Math.random` in mobs.ts/bosses.ts is host-only sim state; `MobView.rock()`'s tumble is a per-client look.
- `hostId`/`isHost`, `born` via `st`, `mw` acceptance (`from === hostId || !W`) and the two-parties-meet rule agree between peers, apart from M-03.
- Chamfer mesh and collision share geometry; secret door leaves no hole; ledge/step/vault heights are consistent with the comments; lava/deep water/chasm behaviour is as described.
- Statues are always solvable; mirrors start unsolved by construction; gems/bells/dials/riddle state machines are sound.
- `MV` in mobviews.ts matches `MOVE` in bosses.ts exactly; boss fx orientation (`fwd(a)`, `flat()`), per-instance materials with shared textures, texture sizes/wrap/colorSpace, dt-clamped springs, `shatter()` scaling, the centipede's teleport reset and the spider's first-state latch are all fine.
- The mines page has no touch controls (`touch.ts` isn't imported): a gap rather than a bug, noted for Dan and Spencer.

**Audio**
- The AudioContext is only created in `unlock()` from a gesture; repeated calls resume. The music scheduler catches up after a stall without dumping notes; tracks don't overlap on change; the carrier hiss runs at gain 0 by design so keying up is instant. All one-shot sources have scheduled stops so their nodes are collected.

**Tools**
- Angle conventions for shop signs, doors, bins, furniture, porticos and the oak all match world.ts/furniture.ts. Roof rectangle and hip conventions agree between lidar.py, buildings.py, world.ts and `roofAt`. All barrier/wall/roof codes the tools emit exist in the game's tables. `z0` is computed before lake beds are dug (harmless). Parked-car layout uses Python's salted `hash()`, so every rebuild reshuffles parked cars (noisy diffs, not player-visible); `zlib.crc32` would fix it. `tools/landmarks/combe_down_bath.py` and docs refer to a `prep_tiles.py` that doesn't exist.

**COMBE DOWN WITH ME**
- Host choice only counts cooks whose `st` says they have the kitchen, so a newcomer with a lower id waits for the first `dk` and takes over from that copy; when the host leaves the next one takes over with `S.h` tidied. `dk`/`dg` are in `MESSAGE_TYPES` and the deli room is `DELI-<code>`, so its messages never reach the streets' or mines' handlers.
- Grab races are settled by the host in arrival order (the item object moves), so two cooks can't hold the same thing. Chop and cook progress rides on the item. Two cooks chopping one board chop twice as fast (reads as a feature).
- The door both ways carries `room`, `map`, `net=local`, `go=1`/`up=1&from=deli` exactly like the mine tour, and `Game` places you at `deliDoor.outside()`.
- Touch, 1-4 cooks (a fifth shares a start tile), `[hidden]`, overlay stacking, camera `fit()` vs `screenToFloor()` in both orientations, and item heights on counters/boards/hobs/tray were all checked.
- Small leaks (name-label textures per hello, smoke and bar materials) and cosmetic bits (tags drawn before the web font loads, cooks spawning facing away) aren't worth tickets.

