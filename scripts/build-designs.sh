#!/usr/bin/env bash
# build-designs.sh — Builds the oracle/web designs from the official examples.
#
# Sources: fortran/original/designs/<id>/, each extracted unmodified from an
# official LEparagliding archive (see its SOURCE.txt). Output, for each design:
#   oracle/designs/<id>/leparagliding.txt  runnable by LEparagliding 3.29
#   oracle/designs/<id>/<airfoil>.txt      airfoils named in section 2
# plus oracle/designs/index.json, the single list of designs read by the
# oracle scripts, the Node runner, the web app and the browser tests.
#
# Adaptation to 3.29 (nothing else is changed):
#   - CRLF -> LF, trailing blank lines removed. How `read(22,*)` (empty list)
#     handles a blank record is implementation-defined, and a blank line
#     before an appended header shifts every following read.
#   - Designs written for an older program stop at section 32 (3.19) or 37
#     (3.21T-3.28). 3.29 reads sections up to 39: each missing one is appended
#     with the official 3-line header and its flag at 0 (program defaults), the
#     contract documented in fortran/original/docs/Updates_log.txt (report 3.20V,
#     "SIMPLIFIED NEW SECTIONS STRUCTURE").
#
# Usage: docker compose run --rm oracle scripts/build-designs.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/fortran/original/designs"
OUT="$ROOT/oracle/designs"

# id | program version the example ships with. Order = order in the web UI.
DESIGNS=(
  "swoop2|3.29"
  "gnuC2-27|3.28"
  "swoop|3.27"
  "A8|3.25"
  "gnuA7-26|3.23"
  "gnuC-27|3.21T"
  "gnu-test-3.19|3.19"
)

HDR='*******************************************************'
declare -A TITLE=(
  [33]="DETAILED RISERS"
  [34]="LINES CHARACTERISTICS TABLE"
  [35]="SOLVE EQUILIBRIUM EQUATIONS"
  [36]="CREATE FILES FOR XFLR5 ANALYSIS"
  [37]="SOME SPECIAL PARAMETERS"
  [38]="HVR HOLES"
  [39]="HVR POSITION PARAMETERS"
)

value_after() { # value_after <file> <comment>: first line after "* <comment>"
  awk -v c="* $2" 'index($0, c) == 1 { getline; print; exit }' "$1" \
    | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^"//' -e 's/"$//'
}

rm -rf "$OUT"
mkdir -p "$OUT"
JSON="["
for entry in "${DESIGNS[@]}"; do
  ID="${entry%%|*}"
  PROGRAM="${entry##*|}"
  S="$SRC/$ID"
  D="$OUT/$ID"
  F="$D/leparagliding.txt"
  mkdir -p "$D"

  # CRLF -> LF, then drop trailing blank (whitespace-only) lines.
  tr -d '\r' < "$S/leparagliding.txt" \
    | awk '{ l[NR] = $0 } /[^[:space:]]/ { last = NR }
           END { for (i = 1; i <= last; i++) print l[i] }' > "$F"

  LAST=$(grep -oE '^\*[[:space:]]+[0-9]+\. ' "$F" | grep -oE '[0-9]+' | sort -n | tail -1)
  ADDED=()
  for ((n = LAST + 1; n <= 39; n++)); do
    printf '%s\n%s\n%s\n0\n' "$HDR" "*       $n. ${TITLE[$n]}" "$HDR" >> "$F"
    ADDED+=("$n")
  done

  # Airfoils: 2nd column of section 2, up to the next section header.
  mapfile -t AIRFOILS < <(awk '/^\*[[:space:]]+2\. AIRFOILS/ { s = 1; next }
                               s && /^\*[[:space:]]+3\. / { exit }
                               s && $2 ~ /\.txt$/ { print $2 }' "$F" | sort -u)
  [ "${#AIRFOILS[@]}" -gt 0 ] || { echo "ERROR: $ID: no airfoil in section 2" >&2; exit 1; }
  for a in "${AIRFOILS[@]}"; do
    tr -d '\r' < "$S/$a" > "$D/$a"
  done

  WING=$(value_after "$F" "Wing name")
  CELLS=$(value_after "$F" "Number of cells")
  if [ ${#ADDED[@]} -gt 0 ]; then
    ADAPTED="sections ${ADDED[0]}-${ADDED[-1]} added at 0"
  else
    ADAPTED=""
  fi
  printf -v AJSON '"%s",' "${AIRFOILS[@]}"
  JSON+=$(printf '\n  {"id":"%s","wing":"%s","program":"%s","cells":%d,"airfoils":[%s],"adapted":"%s"},' \
    "$ID" "$WING" "$PROGRAM" "$CELLS" "${AJSON%,}" "$ADAPTED")
  echo "$ID: $WING ($PROGRAM, $CELLS cells) airfoils: ${AIRFOILS[*]} ${ADAPTED:+[$ADAPTED]}"
done
printf '%s\n]\n' "${JSON%,}" > "$OUT/index.json"
echo "index: $OUT/index.json"
