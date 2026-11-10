#!/usr/bin/env bash
# Build the map (and/or take screenshots) of one commit on the build Mac, in one command, so a request
# from an agent is one line to run. It is for the Mac's Remote Control session, but runs on any
# machine with git, Python (numpy, shapely, Pillow) and Node.
#
#   tools/mac_build.sh <commit or branch> [--map] [--only "ti,tj ti,tj"] [--cold] [--verify] [--check]
#                      [--shots views.json] [--push <branch>] [--out <dir>] [--map-id <id>]
#
#   --map           rebuild the map: canal, railway, every square, the whole-city map and the pubs
#                   (the order in README.md, "Rebuild a map")
#   --only "..."    rebuild only those squares (quick looks)
#   --cold          build the partition from an empty store (a new folder, deleted afterwards), not
#                   from the stages kept in $CACHE/partition
#   --verify        build the map twice, from the store and then from an empty one, and compare every
#                   map file byte for byte: verify.txt says "identical", or which files differ and the
#                   first partition stage whose outputs differ. Exits 1 on any difference. Run it before
#                   each big merge into the maintainer's main: a stage's key is read from its source, and
#                   can miss a name made at run time, an environment variable or a file it reads.
#   --check         run the clash check (tools/check_map.py --all) after building, and keep its report
#   --shots f.json  build the game and take the views in f.json with tools/shoot.mjs
#   --push b        commit the rebuilt map files to branch b on the fork ($COMBEDOWNER_FORK,
#                   or the build checkout's remote that isn't origin)
#   --out d         where the report goes (default ~/combedowner-builds/<short commit>)
#   --map-id id     which map to build (default combe-down)
#
# What it does, so nothing is left behind and two requests never fight over the machine:
#  - waits its turn: only one of these runs at a time (a lock in ~/.combedowner-build.lock);
#  - checks the commit out into a throwaway worktree, never touching $REPO's own files;
#  - if that commit's map was built here before with the same options, it says so and reuses it;
#  - shares node_modules between worktrees with the same package-lock.json, and the partition's
#    stages in $CACHE/partition, so a fresh worktree builds only what its commit changed;
#  - writes build.log, cache.txt (each partition stage's key, what came from the store, what was
#    built and how long it took), check.txt (with --check), changed.txt (which map files changed),
#    the shots and timings.txt to the report folder, and removes the worktree at the end, even if it
#    fails.
set -euo pipefail

REPO=${COMBEDOWNER_REPO:-$HOME/CombeDowner}
VENV=${COMBEDOWNER_VENV:-$HOME/.venvs/combedowner}
CACHE=${COMBEDOWNER_CACHE:-$HOME/.cache/combedowner}
MAP=combe-down
# The build checkout's origin is the main repo; the fork is its other remote.
fork_url() {
  if [ -n "${COMBEDOWNER_FORK:-}" ]; then echo "$COMBEDOWNER_FORK"; return; fi
  local main r u
  main=$(git -C "$REPO" remote get-url origin 2>/dev/null || true)
  for r in $(git -C "$REPO" remote); do
    u=$(git -C "$REPO" remote get-url "$r")
    if [ "$u" != "$main" ]; then echo "$u"; return; fi
  done
  echo "$main"
}
FORK=$(fork_url)
HERE=$(cd "$(dirname "$0")" && pwd)       # this copy's tools, for the screenshot tool on older commits
hash16() { if command -v shasum >/dev/null; then shasum; else sha1sum; fi | cut -c1-16; }

ref=${1:?usage: tools/mac_build.sh <commit or branch> [--map] [--only \"ti,tj ...\"] [--check] [--shots views.json] [--push branch] [--out dir]}
shift
do_map= only= check= shots= push= out= cold= verify=
while [ $# -gt 0 ]; do
  case $1 in
    --map) do_map=1 ;;
    --only) only=$2; do_map=1; shift ;;
    --cold) cold=1; do_map=1 ;;
    --verify) verify=1; do_map=1 ;;
    --check) check=1 ;;
    --shots) shots=$(cd "$(dirname "$2")" && pwd)/$(basename "$2"); shift ;;
    --push) push=$2; shift ;;
    --out) out=$2; shift ;;
    --map-id) MAP=$2; shift ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
  shift
done

# ---- one at a time ------------------------------------------------------------------------------
LOCK=$HOME/.combedowner-build.lock
until mkdir "$LOCK" 2>/dev/null; do
  # a lock left by a build that was killed outright: an hour is far longer than any build
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +60 2>/dev/null)" ]; then echo "clearing a stale lock"; rm -rf "$LOCK"; continue; fi
  echo "waiting: another build is running ($(cat "$LOCK/who" 2>/dev/null || echo unknown))"
  sleep 5
done
echo "$ref since $(date +%H:%M:%S)" > "$LOCK/who"

WT= EMPTY= KEPT=
cleanup() {
  [ -n "$WT" ] && git -C "$REPO" worktree remove --force "$WT" 2>/dev/null || true
  [ -n "$EMPTY" ] && rm -rf "$EMPTY"
  [ -n "$KEPT" ] && rm -rf "$KEPT"
  rm -rf "$LOCK"
}
trap cleanup EXIT

# ---- the commit, in its own worktree ------------------------------------------------------------
git -C "$REPO" fetch -q origin 2>/dev/null || true
git -C "$REPO" fetch -q "$FORK" "$ref" 2>/dev/null || true
sha=$(git -C "$REPO" rev-parse --verify -q "$ref^{commit}" || git -C "$REPO" rev-parse --verify -q "origin/$ref^{commit}" || git -C "$REPO" rev-parse FETCH_HEAD)
short=${sha:0:7}
out=${out:-$HOME/combedowner-builds/$short}
mkdir -p "$out"
out=$(cd "$out" && pwd)
: > "$out/timings.txt"
stamp() { echo "$1: $(( $(date +%s) - $2 ))s" | tee -a "$out/timings.txt"; }
echo "commit $sha ($ref)" | tee "$out/commit.txt"

WT=$(mktemp -d "${TMPDIR:-/tmp}/combedowner-$short-XXXX")
git -C "$REPO" worktree add -q --detach "$WT" "$sha"
cd "$WT"
# shellcheck disable=SC1091
[ -f "$VENV/bin/activate" ] && . "$VENV/bin/activate"

# ---- the map ------------------------------------------------------------------------------------
key="$sha $MAP${only:+ only $only}"
done_mark=$CACHE/maps/$(echo "$key" | hash16)
if [ -n "$do_map" ] && [ -z "$cold$verify" ] && [ -d "$done_mark" ]; then
  echo "this commit's map was built here before (${only:-every square}): reusing it"
  cp -R "$done_mark/maps/." web/public/maps/
  cp "$done_mark"/*.txt "$out/" 2>/dev/null || true
  do_map=
  reused=1
fi
# the game's packages, shared between worktrees with the same package-lock.json: the screenshots need
# them, the clash check, whose rules 19 on run the game's own code under Node, and the map build, which
# reads the set pieces' outlines from the game's table (tools/partition/setpiece_cuts.py)
nm=
link_node_modules() {
  [ -n "$nm" ] && return
  nm=$CACHE/node_modules/$(hash16 < web/package-lock.json)
  if [ ! -d "$nm/node_modules" ]; then
    mkdir -p "$nm" && cp web/package.json web/package-lock.json "$nm/"
    (cd "$nm" && npm ci --no-audit --no-fund --silent)
  fi
  ln -s "$nm/node_modules" web/node_modules
}
build_map() {    # <partition store> <log>
  link_node_modules
  export CD_PARTITION_CACHE=$1
  {
    python3 -I tools/mapdata.py unpack $MAP
    python3 -I tools/canal.py $MAP data/raw/$MAP/wide web/public/maps/$MAP-canal.json
    python3 -I tools/railway.py $MAP data/raw/$MAP/wide web/public/maps/$MAP-rail.json
    if [ -n "$only" ]; then
      # shellcheck disable=SC2086
      python3 -I tools/prep_tiles.py $MAP data/raw/$MAP/wide web/public/maps/$MAP --force --only $only
    else
      python3 -I tools/prep_tiles.py $MAP data/raw/$MAP/wide web/public/maps/$MAP --force
      python3 -I tools/prep_wide.py $MAP data/raw/$MAP/wide web/public/maps/$MAP-wide.json
      python3 -I tools/pubs.py $MAP data/raw/$MAP/wide web/public/maps/$MAP-pubs.json
      python3 -I tools/ground_kinds.py $MAP
    fi
  } > "$2" 2>&1 || { stamp "map build FAILED" "$t"; tail -30 "$2"; exit 1; }
}
STAGES=data/raw/$MAP/wide/partition
# the partition's stages, kept between builds and worktrees (tools/partition/pipeline.py)
store=$CACHE/partition/$MAP
if [ -n "$cold$verify" ]; then EMPTY=$(mktemp -d "${TMPDIR:-/tmp}/combedowner-empty-store-XXXX"); fi
[ -n "$cold" ] && store=$EMPTY
if [ -n "$verify" ]; then
  t=$(date +%s)
  build_map "$store" "$out/build.log"
  stamp "map build from the store" "$t"
  cp "$STAGES/cache.txt" "$out/cache.txt" 2>/dev/null || true
  KEPT=$(mktemp -d "${TMPDIR:-/tmp}/combedowner-verify-XXXX")
  cp -R web/public/maps "$KEPT/maps"
  cp "$STAGES/stages.json" "$KEPT/stages.json" 2>/dev/null || true
  # back to the commit as checked out, so the second build starts where the first did
  git checkout -q -- web/public/maps
  git clean -fdxq web/public/maps data
  t=$(date +%s)
  build_map "$EMPTY" "$out/build-cold.log"
  stamp "map build from an empty store" "$t"
  cp "$STAGES/cache.txt" "$out/cache-cold.txt" 2>/dev/null || true
  verified=0
  python3 -I "$HERE/partition/verify.py" "$KEPT/maps" web/public/maps "$KEPT/stages.json" "$STAGES/stages.json" \
    > "$out/verify.txt" || verified=1
  cat "$out/verify.txt"
elif [ -n "$do_map" ]; then
  t=$(date +%s)
  build_map "$store" "$out/build.log"
  stamp "map build" "$t"
  cp "$STAGES/cache.txt" "$out/cache.txt" 2>/dev/null || true
fi
if [ -n "$do_map" ]; then
  git status --short web/public/maps > "$out/changed.txt"
  echo "$(wc -l < "$out/changed.txt" | tr -d ' ') map files changed"
fi
if [ -n "$check" ]; then
  t=$(date +%s)
  link_node_modules
  [ -d data/raw/$MAP/wide ] || python3 -I tools/mapdata.py unpack $MAP > /dev/null
  python3 -I tools/check_map.py $MAP web/public/maps --all > "$out/check.txt" 2>&1 || true
  stamp "clash check" "$t"
fi
if [ -n "$do_map" ] && [ -z "$cold$verify" ]; then
  mkdir -p "$done_mark/maps"
  git ls-files -m -o --exclude-standard web/public/maps | while read -r f; do
    mkdir -p "$done_mark/maps/$(dirname "${f#web/public/maps/}")"
    cp "$f" "$done_mark/maps/${f#web/public/maps/}"
  done
  cp "$out"/changed.txt "$out"/check.txt "$done_mark/" 2>/dev/null || true
fi

# ---- screenshots --------------------------------------------------------------------------------
if [ -n "$shots" ]; then
  t=$(date +%s)
  link_node_modules
  (cd web && npx vite build --logLevel error)
  stamp "game build" "$t"
  t=$(date +%s)
  PW="$nm/node_modules/playwright" node "$HERE/shoot.mjs" "$shots" --dist "$WT/web/dist" --out "$out/shots" --tag "$short"
  stamp "screenshots" "$t"
fi

# ---- send the map back as a branch on the fork -------------------------------------------------
if [ -n "$push" ] && { [ -n "$do_map" ] || [ -n "${reused:-}" ]; }; then
  git add web/public/maps
  if git diff --cached --quiet; then echo "the map is the same as the commit's: nothing to push"
  else
    git -c user.name="The build Mac" -c user.email="noreply@users.noreply.github.com" commit -q -m "The map is rebuilt on the build Mac from $short"
    git push -q "$FORK" "HEAD:refs/heads/$push"
    echo "pushed the rebuilt map to $FORK $push ($(git rev-parse --short HEAD))"
  fi
fi
echo "report in $out"
if [ "${verified:-0}" != 0 ]; then echo "verify: the build from the store differs from one from an empty store"; exit 1; fi
