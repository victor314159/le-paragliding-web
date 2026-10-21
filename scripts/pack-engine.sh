#!/usr/bin/env bash
# pack-engine.sh — Assembles build/engine/ (scripts/assemble-engine.sh) and
# packs it into build/pkg/<name>-<version>.tgz, then checks the tarball as a user gets it:
#   - publint and attw (are the types wrong): package.json, exports, types;
#   - packages/engine/smoke/: installs the .tgz in a clean directory,
#     type-checks the consumers, runs one design in Node (node.ts: on the
#     calling thread and in a Worker) and bundles a page for the browser
#     (web/) with Vite, which must emit the package's Worker and lepara.wasm,
#     and esbuild (used by Angular, fails on Node built-ins).
#
# Usage: scripts/pack-engine.sh (Dockerfile stage engine-pkg, after the
# oracle check). Needs the npm registry for the check tools.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG="$ROOT/build/pkg"
SMOKE="$ROOT/build/engine-smoke"
DESIGN="$ROOT/oracle/designs/gnuA7-26"

"$ROOT/scripts/assemble-engine.sh"
rm -rf "$PKG" "$SMOKE"
mkdir -p "$PKG"
TGZ="$PKG/$(cd "$PKG" && npm pack --silent "$ROOT/build/engine")"
echo "=== $(basename "$TGZ") ==="
tar -tzf "$TGZ"

cp -R "$ROOT/packages/engine/smoke" "$SMOKE"
cd "$SMOKE"
# Its paths point at the package source (ESLint): test the packed package.
rm tsconfig.json
npm install --no-audit --no-fund --silent
npm install --no-audit --no-fund --silent --no-save "$TGZ"

echo "=== publint ==="
npx publint run "$TGZ" --strict
echo "=== attw ==="
npx attw "$TGZ" --profile esm-only --exclude-entrypoints ./lepara.wasm

echo "=== TypeScript ==="
for MODULE in "nodenext --moduleResolution nodenext" "preserve --moduleResolution bundler"; do
  # shellcheck disable=SC2086
  npx tsc --ignoreConfig --noEmit --strict --skipLibCheck false --target es2022 --lib es2022,dom \
    --types node --module $MODULE node.ts web/main.ts web/worker.ts
done

echo "=== Node ==="
node node.ts "$DESIGN"
[ ! -e "$SMOKE/../stl" ] && [ ! -e "$SMOKE/../xflr5" ] \
  || { echo "the run wrote outside its virtual file system"; exit 1; }

echo "=== Vite ==="
npx vite build web --logLevel warn
WASM=$(find web/dist/assets -name 'lepara*.wasm')
[ -n "$WASM" ] || { echo "Vite did not emit lepara.wasm"; exit 1; }
cmp "$WASM" "$ROOT/build/engine/lepara.wasm"
# Two Workers, the package's (runLeparaglidingInWorker) and the page's, each
# loading the emitted lepara.wasm.
WORKERS=$(grep -oh 'assets/worker-[A-Za-z0-9_-]*\.js' web/dist/assets/index-*.js | sort -u)
[ "$(echo "$WORKERS" | wc -w)" -eq 2 ] || { echo "Vite emitted Workers: $WORKERS"; exit 1; }
for W in $WORKERS; do
  grep -q "$(basename "$WASM")" "web/dist/$W" || { echo "$W does not load $(basename "$WASM")"; exit 1; }
done

echo "=== esbuild ==="
npx esbuild web/worker.ts --bundle --format=esm --platform=browser --log-level=warning \
  --outfile=web/dist-esbuild/worker.js

echo "PACK OK: $TGZ"
