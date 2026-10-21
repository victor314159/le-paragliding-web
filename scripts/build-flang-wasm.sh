#!/usr/bin/env bash
# build-flang-wasm.sh — Compiles build/fortran/leparagliding.f to WebAssembly
# with flang 21.1.8 + emscripten 5.0.7 (compose service `wasm`, r-wasm/flang-wasm
# image pinned by digest). Compiled at build time: browsers and Node only load
# lepara.js + lepara.wasm.
#
# Usage: docker compose run --rm wasm
# The patched source is regenerated first (scripts/make-patched.sh).
# Output: build/wasm/lepara.js (ES module, default export: the `createLepara`
#         factory, MODULARIZE) + lepara.wasm (+ compile.log, link.log;
#         lepara.o is cached and only recompiled when the source or this
#         script is newer, the link skipped when lepara.wasm is newer than
#         lepara.o, this script, the closure externs and the runtime
#         library).
#         packages/engine/ wraps them (scripts/assemble-engine.sh).
#
# Key flags:
#   -O3 (compile, link) : -O0 fails (wasm allows at most 65 535 locals/function).
#                         The link -O3 runs wasm-opt and minifies the JS. Most
#                         of the time is in libFortranRuntime (formatted I/O),
#                         rebuilt with -O3 in the image (build-flang-runtime.sh):
#                         ~9x faster than -O1 with the image's -O0 runtime.
#                         wasm SIMD (+simd128) measured no gain: not enabled.
#   --closure 1         : JS glue 118 KB -> 32 KB; scripts/closure-externs.js
#                         keeps the names closure must not rename
#   -fno-automatic      : local variables of subprograms are static (SAVE), as
#                         gfortran does for local arrays > 64 KB. The code relies
#                         on it: e.g. vredis reads xlin2(1) left by the previous
#                         call. On the flang stack it was garbage (NaN in the DXF,
#                         "Method does not converge").
#   STACK_SIZE=512 MiB  : the main program (~28 000 lines) overflows the default
#                         stack -> "memory access out of bounds"
#   INITIAL_HEAP=64 MiB : start dynamic allocations small, then grow as needed.
#                         Emscripten adds static data (~773 MiB) and the stack
#                         to calculate total initial memory (~1.32 GiB).
#                         A 256 MiB total cannot fit the fixed arrays/stack.
#   MAXIMUM_MEMORY=4 GiB: wasm32 ceiling
#   EXPORT_ES6          : finds lepara.wasm with new URL(..., import.meta.url),
#                         which bundlers follow
#   ENVIRONMENT=web,worker: with node, the glue has `await import('node:module')`,
#                         which esbuild (Angular) cannot bundle for browsers,
#                         and system() would run a real shell under Node (the
#                         program calls system('mkdir ...')).
#                         Node runs this glue as well (Node >= 20 has the web
#                         APIs it uses) when given the .wasm bytes, which it
#                         cannot fetch from a file: URL: the package's Node
#                         entry reads them (packages/engine/src/node.ts). Not
#                         an Emscripten-supported setup: the oracle check
#                         (Node) covers it.
#   ASSERTIONS=0        : otherwise emscripten prints a warning on stderr when
#                         main returns (EXIT_RUNTIME=0)
#   ENV exported        : the wrapper sets FORT_FMT_RECL (packages/engine/src/run.ts)
#   HEAPU8 exported     : report the current WASM allocation in the browser UI
#
# Time: ~1.5 min compile + ~1 min link (amd64 emulated on Apple Silicon).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/build/fortran/leparagliding.f"
OUT="$ROOT/build/wasm"
export PATH=/opt/flang/host/bin:/opt/emsdk/upstream/emscripten:$PATH

"$ROOT/scripts/make-patched.sh"

mkdir -p "$OUT"
cd "$OUT"

if [ ! -f lepara.o ] || [ "$SRC" -nt lepara.o ] || [ "$ROOT/scripts/build-flang-wasm.sh" -nt lepara.o ]; then
  echo "=== Compile ($(flang --version | head -1)) ==="
  flang -c "$SRC" -o lepara.o -O3 -fno-automatic 2> compile.log
else
  echo "=== Compile: lepara.o up to date, skipped ==="
fi

if [ lepara.wasm -nt lepara.o ] && [ lepara.wasm -nt "$ROOT/scripts/build-flang-wasm.sh" ] \
  && [ lepara.wasm -nt "$ROOT/scripts/closure-externs.js" ] \
  && [ lepara.wasm -nt /opt/flang/wasm/lib/libFortranRuntime.a ]; then
  echo "UP TO DATE: $OUT/lepara.js, lepara.wasm"
  exit 0
fi

echo "=== Link ==="
# emcc writes lepara.wasm before closure runs: a failed link must not look up
# to date.
rm -f lepara.js lepara.wasm
emcc lepara.o -L/opt/flang/wasm/lib -lFortranRuntime -o lepara.js -O3 --closure 1 \
  --closure-args="--externs=$ROOT/scripts/closure-externs.js" \
  -sALLOW_MEMORY_GROWTH=1 \
  -sINITIAL_HEAP=67108864 \
  -sMAXIMUM_MEMORY=4294967296 \
  -sSTACK_SIZE=536870912 \
  -sFORCE_FILESYSTEM=1 \
  -sMODULARIZE=1 \
  -sEXPORT_NAME=createLepara \
  -sEXPORT_ES6=1 \
  -sENVIRONMENT=web,worker \
  -sINVOKE_RUN=0 \
  -sEXIT_RUNTIME=0 \
  -sASSERTIONS=0 \
  -sEXPORTED_RUNTIME_METHODS=callMain,FS,ENV,HEAPU8 \
  2> link.log

echo "BUILD OK: $OUT/lepara.js ($(wc -c < lepara.js) B), lepara.wasm ($(wc -c < lepara.wasm) B)"
