#!/usr/bin/env bash
# make-patched.sh — Generates build/fortran/leparagliding.f from the official
# zip (fortran/original/leparagliding3.29.f.zip, the single source of truth)
# + fortran/patches/*.patch.
#
# Steps: check the zip sha256, extract leparagliding.f, CRLF -> LF (the
# official source uses CRLF), then apply the patches in lexicographic order.
# The result is a build product (ignored by git): never edit it, edit the
# patches instead.
#
# Called by build-flang-wasm.sh and run-oracle.sh. The file is only rewritten
# when its content changes (its mtime drives the compile cache).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ZIP="$ROOT/fortran/original/leparagliding3.29.f.zip"
ZIP_SHA256="c4a259aa9fe40fdaae39fcb4ec6efba6c2df6a70492fb19d39b94abdb0b1c056"
OUT="$ROOT/build/fortran/leparagliding.f"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "$ZIP_SHA256  $ZIP" | sha256sum -c --quiet - \
  || { echo "ERROR: unexpected sha256 for the official zip" >&2; exit 1; }

unzip -p "$ZIP" leparagliding.f | tr -d '\r' > "$WORK/leparagliding.f"
for p in "$ROOT"/fortran/patches/*.patch; do
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
