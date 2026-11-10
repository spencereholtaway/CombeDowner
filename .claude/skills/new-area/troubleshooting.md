# Troubleshooting

Find the row whose left column matches text you see in the output (search for it). Do what the
right column says, once. If it fails again, or no row matches: STOP and show the user the last 20
lines of output.

"Rerun" always means the same command again. Every step is safe to rerun: downloads already done
are kept, and squares already built are not built again.

## check

| IF you see | THEN |
|---|---|
| `FAIL python packages: missing` | Run the command printed after `->`. Then `python3 -I tools/new_area.py check` again. |
| `error: externally-managed-environment` (from pip) | You ran `pip3 install` on the system Python. Run the `python3 -m venv ~/.venvs/combedowner && ...` command from the `check` line instead. |
| `Failed building wheel for rasterio` or `gdal-config` | STOP: the user must install GDAL (`brew install gdal` on a Mac), then rerun the pip command. |
| `FAIL web/node_modules` | `cd web && npm install && cd ..`, then `check` again. |
| `FAIL git branch is main` | `git switch -c claude/map-<id>`, then `check` again. |

## find and add

| IF you see | THEN |
|---|---|
| `FAIL no place found` | The finder wants a place's own name and at most one region after it. If the name has more than one comma, keep only the first part and the country (`"<name>, <area>, <country>"` → `"<name>, <country>"`). If it has none, add the county or country: `"<name>, Wiltshire"`, `"<name>, France"`. Try each once. Still none: STOP. |
| `HTTP Error 429` or `HTTP Error 403` (Nominatim) | Wait two minutes, rerun once. Still failing: STOP. |
| `WARN could not reach Nominatim to check the country: assuming NON-UK` | Run `python3 -I tools/new_area.py remove <id>`, wait two minutes, then repeat Step 4. |
| `FAIL '<id>' is already in tools/area.py` | Ask the user for another id. |

## build

| IF you see | THEN |
|---|---|
| `waiting for another build to finish` | Nothing: it waits by itself. Do not delete the lock. If it has waited over an hour it clears the lock itself. |
| `BUILD FAIL missing packages` | Go back to SKILL.md Step 1. |
| `BUILD FAIL at step download` with `HTTP Error 5`, `timed out`, `Connection reset`, `IncompleteRead` or `URLError` above it | A server dropped the connection. Wait two minutes and rerun `build`. A download that died leaves only a `.part` file, which is redone. |
| `BUILD FAIL at step download` with `HTTP Error 404` for `environment.data.gov.uk` (lidar) | Rerun once (the lidar service sometimes answers "not found" for squares it has). Still failing: STOP. |
| `BUILD FAIL at step download` with `overturemaps` or `pyarrow` in the error | Rerun once. Still failing: STOP. |
| `Overpass unavailable (HTTP Error 502 ...); using the main API` (or 429, 504) | Not an error: it falls back by itself. Only if the step then ends in `BUILD FAIL`: wait five minutes and rerun. |
| `BUILD FAIL at step squares` with `FAILED after` and `see <file>` | Read the last 20 lines of that `<file>`. `No module named`: go back to SKILL.md Step 1. `MemoryError` or `Killed`: STOP (the machine needs more memory). Anything else: rerun once, then STOP. |
| `BUILD FAIL at step wide map` | Rerun once. Still failing: STOP. |
| `BUILD FAIL at step lidar ground` | STOP. |
| `BUILD FAIL at step minimap ground` | The squares are missing: rerun `build`. |
| `WARN step railway failed` | Fine: the map has no railway. Report it. |
| `WARN step pubs failed` | Fine: the pause menu's "Go to a pub" lists only the pubs signed in the squares. Report it. |
| `WARN step district names failed` (often `HTTP Error 502` or `504` from Overpass) | Fine: the game names places after parks instead. Once Step 7 is done, rerun `build` once (about a minute: nothing is downloaded or built again); if it fails again, report it. |
| `WARN step church towers failed` | Fine: churches have no measured towers. Report it. |
| `epc: download the energy certificates ... by hand` | Not an error. Ignore it. Energy certificates are by hand only; mention them in "What it lacks". |
| `no lidar data`, `no EPC data` | Not an error outside England. In England, report it. |

## verify

| IF you see | THEN |
|---|---|
| `FAIL web/src/maps.ts has the map` | Step 4 did not finish. Run `python3 -I tools/new_area.py remove <id>`, then repeat from Step 4. |
| `FAIL web/public/maps/<id>.json` or `FAIL squares:` or `FAIL ...-wide.json` or `FAIL ...-ground.json` | The build did not finish. Rerun `build`, then `verify`. |
| `FAIL in the squares: 0 buildings, 0 roads and paths, 0 pieces of water` | STOP: the data is empty there, or the centre is wrong. |
| `INFO only N buildings` | Not an error: open country. Carry on. |
| `FAIL check_map ran` | STOP, and show the user the line after `->`. |
| `WARN clash check` | Carry on. Report the count and the three biggest rule lines. |
| `FAIL git sees changes only to this map's files` | STOP. Something outside this map changed. Do not revert it yourself. |

## shoot

| IF you see | THEN |
|---|---|
| `FAIL npm run shoot finished` with `Cannot find module 'playwright'` | `cd web && npm install && cd ..`, then rerun `shoot`. |
| `browserType.launch` or `Chromium distribution 'chrome' is not found` | STOP: the user must install Google Chrome. |
| `FAIL <view>: loaded` (a view timed out) | Rerun `shoot` once. Still failing: report which view, carry on. |
| `WARN page errors: N` | Carry on. Copy the `INFO page said: error: ...` lines into the report. |
| `INFO page said: error: Failed to load resource: ... status of 404` | Not an error: an optional file (`-canal.json`, `-cable.json` and the like) the map has none of. |
| `context=REAL` | STOP. Audio was not muted. Do not run any more browser commands. |
| `WARN frame rate` | Report it. Not a failure. |

## remove

| IF you see | THEN |
|---|---|
| `FAIL <id> is committed to the repository` | STOP. Never remove a committed map. |
