# Bridges as part of the road and path surface (a second level in the faces)

Agreed with the maintainer on 2026-11-17 (option A, with the plan's recommendations on every decision).
Line numbers are from the bridge-ends work (the main branch + b372ff58, 387647ad); re-find them on your base.

## Short version
- `sf` gains `lv`: a list of levels above the ground, each `{ n, road, service, pave, path, grass, dirt, gravel, stone, steel, e: [{c, i, k?}] }`, indexing the one shared `sf.v`. Plus `sf.dk = 1` meaning "decks are faces: draw no deck strip and no deck top for this square".
- At each abutment the deck's end (cap) edge and the level-0 faces on the other side share the SAME point numbers. No other sharing between levels.
- Level 0 stays exactly as today (the hole under the deck stays, `sp: 2` stays), so older pages ignore `lv`/`dk` and still draw strips. Purely additive. New pages on unrebuilt squares (no `lv`) take today's path.
- Rejected: per-triangle level flag (older pages would draw/walk decks twice and stand towpath walkers at deck height); separate deck file (can't share points).
- Levels from the build's spans and heights (structures.py, deck_stretches), not OSM `layer` (only a tie-break when two decks overlap in plan).

## Build (tools/partition/write_tile.py street_surfaces)
1. Footprint F = union of buffered deck_stretches before under-ways are given back (`bridge_decks` :3114). Hole H = F − kept (today). Return F too.
2. Level-1 pieces: the partition's own carriageway/pavement faces within F (shapes() before difference(deck)) — cut by the same cap line, so cap corners are level 0's. Where a kept way / path_under lies inside F, use the bridge's own cross-section from its record (w, pv/pw via pv_at, dk) as deckSides does. Margin = F − road − pavement − path → `stone` or `steel` by bridge_kinds' bt. Then the same steps as level 0, restricted to F: road_cracks, pave_slivers, neat_kerbs/thin_to, pedestrian/plaza rules, needles_off, setpiece_cuts.holes (every level). Footbridge path face = path_kind by su.
3. coverage_simplify level 1 on its own; then re-snap cap corners both ways between levels (noded's snapping restricted to cap segments); _points_where_needed with keep_all inside.
4. point() (:5564) keys by (x, y, on_ground) — add level, so deck points never merge with points below; cap points seeded first with one height and looked up by (x, y) on a cap by all levels.
5. _outlines per level → lv[k].e; on a cap edge the two levels' outlines run opposite ways.
6. Pack: pack_surfaces/unpack_surfaces (:3385/:3404) step lv the same way; out["lv"], out["dk"]=1.

Heights on level 1: the deck's own profile, flat across — nearest deck stretch's 3D line at the projection; span points their own z; end points se's held height (e[3], held 1 or 2) = deckTop's rule (map.ts:2355) moved into the build. Junctions on a deck: street_level's blend over deck streets only. A `joint` end into another deck = same level, no cap. Cap height = deck line's height at the cap; level 0's nearby corners absorb any cm (as ends_on_faces does). Flight-held abutments: cap at the flight's height. Markings: road_markings includes level-1 carriageway with level-1 heights; face_heights gains a level argument (fixes markings stopping at bridges).

Sheet: sheet.py / sheet.ts read only level 0, unchanged; the cap is still a free edge of level 0 to them, so the ground still lets down under the deck (DECK_UNDER).

Tunnels/passages: unchanged; no levels below 0 in this work (format leaves room for n: -1, first use = paths under streets `tu`).

## Game
- sfpack.ts unpacks lv (transfers its buffers); MapData.sf type gains lv?, dk?.
- world.ts surfaceFaces: draw each level's lists into the SAME geo[kind] (stone → geo.bridge, steel → geo.steel); key spot/owner/inner/faceKind maps by level; on a cap edge with a partner at the other level draw no edge face (no kerb, cliff, sheetEdge wall); on level 1's outer free edges no kerb/cliff (structure stands there).
- roadMeshesGen (:2102): with sf.dk, own bridge records (and `held` ones) get no deckStretches strips.
- bridgeStructures: with sf.dk skip the deck-top fill (:1876); sample `top` from the level-1 face (deckFace(x, y)) instead of deckTop. Stage 3: sides/parapets follow level 1's outer outline edges.
- Walking: deckCells over level-1 triangles (like faceCells :3359); surface(x, z, y) stands you on the highest level-1 face whose top (+ kind lift) ≤ y + 0.6, else level 0. Drops deck()'s "> 0.3 m over ground" test for dk squares. map.ground(x, z) without y stays level 0. map.standOnDecks(fn) hook; deck() uses it for dk squares, falls back to line-based decks otherwise.
- Stage 3: parapet collision from level-1 outer edges (+1.25) instead of the line (map.ts :589-597); underside/ceiling (:1491), overhead (:1078), canal works' under (:643) from faces.
- Stage 4: raycast hits the deck slab; naughty boys and cats use a level-aware height from their last y (host-only, no new message); spawn spots test the level.
- Traffic/vehicles unchanged (already pass y). Minimap unchanged. No new meshes/draw calls; triangles should be about equal (faces replace strip + deck-top fill).
- Set pieces: clearSetPieceGround/clearFaces (setpieces.ts:566) over all levels (height-aware); Pulteney's held deck becomes level-1 faces; its model still reads ctx.held. Risk: map.setPieceSurface claiming a floor at deck height clears the deck faces — check Pulteney's square first.

## Checks
Most read only known lists, so they keep measuring level 0 until taught — that's what makes stage 1 safe.
- rule 9/3/10 (check_map 478-600): ground things vs level 0; deck things vs level 1. check_map:627 stays level 0.
- 20/23 overroad.mjs: drop r.bridge / span-point skips (:313, :399) so decks are measured.
- 28: for dk squares, "cap points not shared" and "cap height differs > 1 cm" (0 by construction).
- 29/30/31: from level-1 faces/outline (check_more 1684-1855).
- 38, 44-46 ground_seams.mjs: level-1 outer free edges closed by stone/steel meshes or excluded by rule; cap edges 0 cracks.
- 41 per level + across a cap; 42 per level (same n both sides of a square edge); 47 checks level-1 faces under span points; 53 covered = level-1 union.
- New rule 54: F uncovered at level 1 (m²), overlap within a level, decks over decks (count), level-1 points > 2 cm off the deck line.
- watertight.py per level (+ "cap edges not shared").

## Stages (each shippable)
0. Baselines, whole map (½ day): check_map/check_more all rules (sheet on), watertight, endprobe (scratchpad/br/endprobe.mjs) every end, tools/road_bumps.mjs on every square with a bridge (bumps within 15 m of an end), pack size per square, build time, triangles/meshes per square, walk/ride probes across and under a set of bridges incl. towpaths.
1. Build writes sf.lv; game ignores it (4-6 days). write_tile, pack/unpack, watertight per level, rule 54, rules 28/42/53 level-aware, sfpack unpacks lv. Gates: every old count same or lower; rule 54 = 0 bar listed exceptions; pack ≤ +1% any square; build time ≤ +3%; squares with no bridges byte-identical; endprobe no worse. Outputs: list of decks over decks, bridges whose record cross-section differs from the partition's at a cap by > 0.3 m, culverts by clearance.
2. Game draws and stands on deck faces (4-6 days; can start on one trial square during stage 1). Behind ?decks=strips (old path) for one release. Gates: endprobe lip ≤ 2 cm at every end; no new road_bumps within 15 m of a cap; rules 20/23/38 with decks, no new cap cracks; meshes per square unchanged; triangles ±5%; build time ±5%; ride/walk probes same or better; maintainer looks at Pulteney, Ferry Lane, a footbridge with steps.
3. Structure and collision follow the deck face (3-5 days). Gates: rule 29 = 0 on dk squares; 30/31 no worse; parapet walks never leave the deck; boats still pass under.
4. Movers and bullets level-aware (2-3 days, parallel with 3). Gates: a naughty-boy chase over a bridge stays on the deck; a shot from the towpath hits the deck underside; rule 39 includes decks.
5. Remove old strip path for faced squares (1-2 days, after every partition map is rebuilt and one release out). Keep strips for maps without sf (Hackney prep_map, single-file build) and outskirts.ts; keep deckTop/spanFlags/se held for them.
6. (optional) Fold culverts (< DECK_CLEAR air and nothing under) into level 0; then underpasses as level −1.

### Faults seen in play with ?decks=1, to fix before decks go on for everyone
Found by the maintainer on the test site (build 23747f8). Stages 3 and 4 are expected to clear the structure ones; the rest are faults in stages 1–2.
- Pulteney, Grand Parade side, `?at=-906,2268,104,-10`: the paving's edge at the foot of the set piece's tall stone block is jagged and stepped, with a dark gap and a notch. Check whether this shows without decks too.
- Midford Road, `?at=118,-1924,254,-3`: a thin green line runs across the carriageway at the deck's end, which looks like a crack at the cap. The right-hand pavement turns to rough stone along the deck.
- Midland Road truss, `?at=-2217,2473,174,-10`: a grey stone wedge slopes from the ground up to the deck. The deck's pavement is a raised block with a stepped end. Brown dirt lies between the pavement and the truss, and the truss stands beside the deck edge rather than on it.
- Under Midland Road on the cycle track, `?at=-2204,2456,325,15`: the bank runs up into the deck's underside, with no abutment wall at that end.
- Ferry Lane, `?at=2989,1562,26,-10` and `?at=2991,1575,191,-5`: the left parapet stops short and the right has none, only a stone slab, dirt and a drop. From the bank the flat deck sits beside the stone arch on its own stepped walls instead of on top of it.

Trial squares: 1,2 (Widcombe footbridges, canal, towpath), 0,2 (Broad Quay, Wells Road bridge), 1,3 (Sydney Gardens canal bridges), Pulteney's square, Ferry Lane's 4,2, and one where a bridge crosses a square edge.

## Decisions (agreed)
1. Format sf.lv + sf.dk. 2. Culverts: as every deck in stage 1, fold into level 0 in stage 6. 3. No layer tag: levels from spans/heights. 4. Footbridges: same treatment; flights land on the cap at flight height. 5. Railway's own bridges (railbridge.ts) unchanged; road bridges over rail are level 1. 6. Viaducts: level 1 abutment to abutment only; embankment approaches stay level 0. 7. Square edges: clip level 1 at the edge like level 0; rule 42 per level. 8. Set pieces as above. 9. Cap cross-section: from the partition's faces; record cross-section only where a way below took the faces; taper kerbs; list > 0.3 m. 10. sheet unchanged; game skips the edge face at partnered cap edges. 11. Decks over decks: levels 2+ by height; don't polish if Bath has none. 12. Naughty boys/cats on decks: yes, stage 4. 13. Bullets hit decks: yes, stage 4. 14. Gates 1% pack, 3% build. 15. Accept slight level-0 height changes at caps; measure. 16. Spans are decided once, by the city's structures pass. A square's own steps (empty spans, the cut at its sides, set pieces' decks) leave a stretch at a side as the city marked it, so the two squares agree there.

## Docs to update as it lands
docs/plans/ground-architecture.md §1, §4.2, §4.4 bridge row, §4.6 gs.k "deck end", §4.7; docs/partition-build-plan.md stage 5; docs/partition-revisit.md "Street faces"; docstrings in write_tile.street_surfaces (:5021-5024), bridge_decks (:3098-3103), ends.py module, watertight.py, world.ts deckStretches (:2160), map.ts MapData.sf sp comment (:101), surface.py header; CLAUDE.md's partition description; docs/playing.md where players notice.
