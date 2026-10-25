#!/usr/bin/env bash
# Assemble build/<name>/ from packages/<name>/, after its @lepara dependencies:
# its sources compiled by tsc (ES modules + declarations), its documents and
# LICENSE. build/node_modules/ links each package, for Node to resolve them.
#
# Usage: scripts/assemble-package.sh format|preprocessor|design|views (after npm ci)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NAME="$1"
PACKAGE="$ROOT/packages/$NAME"
OUT="$ROOT/build/$NAME"
for dependency in $(node -p "Object.keys(require('$PACKAGE/package.json').dependencies ?? {})
  .filter((name) => name.startsWith('@lepara/')).map((name) => name.slice(8)).join(' ')"); do
  "$0" "$dependency"
done
rm -rf "$OUT"
CONFIG="$PACKAGE/tsconfig.build.json"
[ -f "$CONFIG" ] || CONFIG="$PACKAGE"
"$ROOT/node_modules/.bin/tsc" -p "$CONFIG"
cp "$PACKAGE/package.json" "$PACKAGE"/*.md "$ROOT/LICENSE" "$OUT/"
mkdir -p "$ROOT/build/node_modules/@lepara"
ln -sfn "../../$NAME" "$ROOT/build/node_modules/@lepara/$NAME"
echo "ASSEMBLED: $OUT"
