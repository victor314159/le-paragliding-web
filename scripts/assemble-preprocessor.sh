#!/usr/bin/env bash
# Assemble the dependency-free ES modules and declarations in build/preprocessor/.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/build/preprocessor"
rm -rf "$OUT"
"$ROOT/node_modules/.bin/tsc" -p "$ROOT/packages/preprocessor"
cp "$ROOT/packages/preprocessor/"{package.json,README.md} "$ROOT/LICENSE" "$OUT/"
echo "ASSEMBLED: $OUT"
