#!/usr/bin/env bash
# build-flang-runtime.sh — Rebuilds libFortranRuntime.a (flang's Fortran
# runtime, compiled to wasm32-emscripten) with -O3, from the commit of
# r-wasm/llvm-project the image's flang was built from (flang --version).
#
# The library shipped in the r-wasm/flang-wasm image is compiled without -O
# (its Makefile: em++ $(RUNTIME_CXXFLAGS) -c, i.e. -O0) and the program spends
# most of its time in it: formatted I/O (std::variant visitors, std::min/max
# left as calls). Same sources and flags as that Makefile, plus -O3.
#
# Usage (Dockerfile, flang stage): scripts/build-flang-runtime.sh <output.a>
# Time: ~5 min (amd64 emulated on Apple Silicon).
set -euo pipefail

OUT="$1"
COMMIT=7ca73ca1ab129c86e63fd3a25aaa58bbf4b5d88c
SRC="$(mktemp -d)"
OBJ="$SRC/obj"
export PATH=/opt/flang/host/bin:/opt/emsdk/upstream/emscripten:$PATH

flang --version | head -1 | grep -q "$COMMIT" \
  || { echo "flang is not built from r-wasm/llvm-project $COMMIT: update COMMIT"; exit 1; }

git -C "$SRC" init -q
git -C "$SRC" remote add origin https://github.com/r-wasm/llvm-project
git -C "$SRC" sparse-checkout set --no-cone /flang-rt/lib/runtime /flang-rt/include \
  /flang/include /flang/lib/Decimal /llvm/include
git -C "$SRC" fetch -q --depth=1 --filter=blob:none origin "$COMMIT"
git -C "$SRC" checkout -q FETCH_HEAD

mkdir -p "$OBJ/config"
printf '#ifndef FORTRAN_RUNTIME_CONFIG_H\n#define FORTRAN_RUNTIME_CONFIG_H\n#define HAVE_STRERROR_R 1\n#define HAVE_DECL_STRERROR_S 0\n/* #undef HAVE_BACKTRACE */\n#endif\n' \
  > "$OBJ/config/config.h"

FLAGS=(
  -O3
  -I"$OBJ/config"
  -I"$SRC/flang/include" -I"$SRC/flang-rt/include" -I"$SRC/llvm/include"
  -DFLANG_LITTLE_ENDIAN
  -fPIC -Wno-c++11-narrowing -fvisibility=hidden
  -DFE_UNDERFLOW=0 -DFE_OVERFLOW=0 -DFE_INEXACT=0
  -DFE_INVALID=0 -DFE_DIVBYZERO=0 -DFE_ALL_EXCEPT=0
)
SOURCES=("$SRC"/flang-rt/lib/runtime/*.cpp
  "$SRC/flang/lib/Decimal/decimal-to-binary.cpp"
  "$SRC/flang/lib/Decimal/binary-to-decimal.cpp")

export OBJ
printf '%s\n' "${SOURCES[@]}" | xargs -P "$(nproc)" -I{} \
  sh -c 'em++ "$@" -c "{}" -o "$OBJ/$(basename "{}" .cpp).o"' _ "${FLAGS[@]}"

rm -f "$OUT"
emar -rcs "$OUT" "$OBJ"/*.o
echo "RUNTIME OK: $OUT (${#SOURCES[@]} sources, $(wc -c < "$OUT") B)"
rm -rf "$SRC"
