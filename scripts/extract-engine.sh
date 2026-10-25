#!/usr/bin/env bash
# Extract the unmodified official engine (only CRLF -> LF). Shared by the
# reference generator and the WASM patch pipeline; never apply patches here.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ZIP="$ROOT/fortran/engine/original/leparagliding3.29.f.zip"
ZIP_SHA256="c4a259aa9fe40fdaae39fcb4ec6efba6c2df6a70492fb19d39b94abdb0b1c056"
OUT="${1:?Usage: extract-engine.sh output.f}"
WORK="$(mktemp)"
trap 'rm -f "$WORK"' EXIT

echo "$ZIP_SHA256  $ZIP" | sha256sum -c --quiet -
unzip -p "$ZIP" leparagliding.f | tr -d '\r' > "$WORK"
mkdir -p "$(dirname "$OUT")"
if ! cmp -s "$WORK" "$OUT"; then
  cp "$WORK" "$OUT"
fi
