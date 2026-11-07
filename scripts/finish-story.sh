#!/bin/bash
# Finish one story: syntax-check changed files, mark the ticket built, mark next tickets in-progress, commit.
# usage: scripts/finish-story.sh <done-ref> "<commit message>" [<next-ref>...]
#   refs look like 3.2 (epic id . entry id), see `tickets.py status initiative-schulweg-game`.
# Needs: git, node, uv, and the BMad ticket skill (override its path with TICKETS_PY).
set -u
cd "$(dirname "$0")/.." || exit 1
INIT="${INIT:-initiative-schulweg-game}"
TICKETS_PY="${TICKETS_PY:-$HOME/.claude/skills/bmad-ticket/scripts/tickets.py}"
T="uv run $TICKETS_PY --project-root ."
bad=0
for f in $(git ls-files -o -m --exclude-standard | grep -E '\.js$'); do
  [ -f "$f" ] || continue
  node --check "$f" >/dev/null 2>&1 || { echo "SYNTAX FAIL $f"; bad=1; }
done
for j in $(git ls-files -o -m --exclude-standard | grep -E '\.json$'); do
  [ -f "$j" ] || continue
  node -e "JSON.parse(require('fs').readFileSync('$j','utf8'))" 2>/dev/null || { echo "JSON FAIL $j"; bad=1; }
done
[ "$bad" = 1 ] && exit 1
node scripts/check-all.mjs | tail -1
$T mark "$INIT" "$1" built >/dev/null
shift
msg="$1"; shift
for n in "$@"; do $T mark "$INIT" "$n" in-progress >/dev/null; done
git add -A
git commit -q -m "$msg"
git log --oneline | head -1
