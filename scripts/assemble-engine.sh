#!/usr/bin/env bash
# assemble-engine.sh — Assembles the npm package directory build/engine/:
# packages/engine/src/ compiled by tsc (JS + declarations), the Emscripten
# glue build/wasm/lepara.{js,wasm} (scripts/build-flang-wasm.sh) with its
# declarations, package.json, README.md and LICENSE. The app serves it
# (angular.json), check-wasm-oracle.sh runs the oracle through it and
# pack-engine.sh packs it.
#
# Usage: scripts/assemble-engine.sh (after npm ci: uses the project's tsc)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/build/engine"

rm -rf "$OUT"
"$ROOT/node_modules/.bin/tsc" -p "$ROOT/packages/engine"
cp "$ROOT/packages/engine/"{package.json,README.md,src/lepara.d.ts} "$ROOT/LICENSE" \
  "$ROOT/build/wasm/"{lepara.js,lepara.wasm} "$OUT/"
echo "ASSEMBLED: $OUT"
