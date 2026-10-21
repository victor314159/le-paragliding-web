/**
 * @fileoverview Closure externs for build-flang-wasm.sh (emcc --closure 1):
 * names closure must not rename.
 * @externs
 */

/**
 * The part of Module.FS used by packages/engine/src/run.ts (the only caller).
 * Emscripten keeps the FS export but not the names of its methods (isDir
 * was renamed: the browser run failed after the engine).
 * @const
 */
var LeparaFSExterns = {};
LeparaFSExterns.mkdir = function () {};
LeparaFSExterns.chdir = function () {};
LeparaFSExterns.writeFile = function () {};
LeparaFSExterns.readFile = function () {};
LeparaFSExterns.readdir = function () {};
LeparaFSExterns.stat = function () {};
LeparaFSExterns.isDir = function () {};
LeparaFSExterns.mode;
