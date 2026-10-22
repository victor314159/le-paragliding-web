#!/usr/bin/env bash
# assemble-format.sh — Assembles the package directory build/format/:
# packages/format/src/ compiled by tsc (ES modules + declarations),
# package.json, README.md, SPEC.md and LICENSE. tests/format/package.spec.ts
# imports it in Node and Chromium.
#
# Usage: scripts/assemble-format.sh (after npm ci: uses the project's tsc)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/build/format"

rm -rf "$OUT"
"$ROOT/node_modules/.bin/tsc" -p "$ROOT/packages/format"
cp "$ROOT/packages/format/"{package.json,README.md,SPEC.md} "$ROOT/LICENSE" "$OUT/"
echo "ASSEMBLED: $OUT"
