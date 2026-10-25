#!/usr/bin/env bash
# make-patched.sh — Generates build/fortran/leparagliding.f from the official
# zip (fortran/engine/original/leparagliding3.29.f.zip, the single source of truth)
# + fortran/engine/patches/*.patch.
#
# Steps: check the zip sha256, extract leparagliding.f, CRLF -> LF (the
# official source uses CRLF), then apply the patches in lexicographic order.
# The result is a build product (ignored by git): never edit it, edit the
# patches instead.
#
# Called by build-flang-wasm.sh. The native oracle uses extract-engine.sh
# directly, without our patches. The file is only rewritten
# when its content changes (its mtime drives the compile cache).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/build/fortran/leparagliding.f"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

"$ROOT/scripts/extract-engine.sh" "$WORK/leparagliding.f"
for p in "$ROOT"/fortran/engine/patches/*.patch; do
  echo "patch: $(basename "$p")"
  patch --quiet --no-backup-if-mismatch -d "$WORK" -p1 < "$p"
done

mkdir -p "$(dirname "$OUT")"
if cmp -s "$WORK/leparagliding.f" "$OUT"; then
  echo "up to date: $OUT"
else
  cp "$WORK/leparagliding.f" "$OUT"
  echo "written: $OUT ($(wc -l < "$OUT") lines)"
fi
