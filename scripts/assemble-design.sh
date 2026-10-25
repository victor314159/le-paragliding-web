#!/usr/bin/env bash
# Assemble build/design/ against the assembled build/format/ and
# build/preprocessor/, which build/node_modules/ links for Node to resolve.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/build/design"
"$ROOT/scripts/assemble-format.sh"
"$ROOT/scripts/assemble-preprocessor.sh"
rm -rf "$OUT"
"$ROOT/node_modules/.bin/tsc" -p "$ROOT/packages/design/tsconfig.build.json"
cp "$ROOT/packages/design/"{package.json,README.md} "$ROOT/LICENSE" "$OUT/"
mkdir -p "$ROOT/build/node_modules/@lepara"
for package in format preprocessor design; do
  ln -sfn "../../$package" "$ROOT/build/node_modules/@lepara/$package"
done
echo "ASSEMBLED: $OUT"
