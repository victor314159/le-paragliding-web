#!/usr/bin/env bash
# check-wasm-oracle.sh — Runs build/wasm/lepara.js (Node) on the designs of
# oracle/designs/index.json and compares the WHOLE output tree BYTE FOR BYTE
# (sha256) with oracle/reference/<id>/MANIFEST.sha256: same files (run
# directory, stl/, xflr5/), same content. The manifest is versioned for every
# output; the large ones (DXF, STL, SCAD) are not (run-oracle.sh regenerates
# them).
#
# The only accepted differences are the files listed in
# oracle/wasm-known-diffs.tsv (content only: the file must exist on both
# sides). A listed file that became identical is reported, to drop the entry.
#
# Usage: docker compose run --rm oracle scripts/check-wasm-oracle.sh
# Exit code 0 iff every output is identical or a listed known difference.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/scripts/oracle-lib.sh"
mapfile -t DESIGNS < <(design_ids)

# "<design>/<file>" -> reason
declare -A KNOWN=()
KD=$(known_diffs "$ROOT/oracle/wasm-known-diffs.tsv" 3) || exit 1
while IFS=$'\t' read -r D F REASON; do
  [ -n "$D" ] && KNOWN["$D/$F"]="$REASON"
done <<< "$KD"

FAIL=0
for D in "${DESIGNS[@]}"; do
  OUT="$ROOT/build/wasm-runs/$D"
  MANIFEST="$ROOT/oracle/reference/$D/MANIFEST.sha256"
  rm -rf "$OUT"
  node "$ROOT/scripts/run-wasm-node.ts" "$ROOT/oracle/designs/$D" "$OUT" \
    || { echo "[$D] RUN FAILED"; FAIL=1; continue; }
  N=0
  while IFS= read -r LINE; do
    EXPECTED="${LINE%%  *}"
    NAME="${LINE#*  ./}"
    REASON="${KNOWN["$D/$NAME"]-}"
    N=$((N + 1))
    if [ ! -e "$OUT/$NAME" ]; then
      echo "[$D] $NAME MISSING from the WASM output"; FAIL=1
    elif [ "$(sha256sum < "$OUT/$NAME" | cut -d' ' -f1)" = "$EXPECTED" ]; then
      [ -n "$REASON" ] && echo "[$D] $NAME is now identical: remove it from oracle/wasm-known-diffs.tsv"
    elif [ -n "$REASON" ]; then
      echo "[$D] $NAME differs (known: $REASON)"
    else
      echo "[$D] $NAME DIFFERENT"; FAIL=1
    fi
  done < "$MANIFEST"
  # Files produced by the WASM build only.
  EXTRA=$(LC_ALL=C comm -13 <(cut -c69- "$MANIFEST") <(hash_tree "$OUT" | cut -c69-))
  [ -n "$EXTRA" ] && { echo "[$D] EXTRA WASM OUTPUT: $EXTRA"; FAIL=1; }
  echo "[$D] $N reference files checked"
done

[ "$FAIL" -eq 0 ] && echo "WASM ORACLE: GREEN" || echo "WASM ORACLE: RED"
exit "$FAIL"
