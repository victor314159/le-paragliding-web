/**
 * @fileoverview Closure externs for build-flang-wasm.sh (emcc --closure 1):
 * names closure must not rename.
 * @externs
 */

/**
 * Emscripten 5.0.7 implements system() in Node with
 * require('node:child_process').spawnSync(cmd, [], { shell: true }) but
 * declares neither name ("require(...).ob is not a function" on the program's
 * `call system('mkdir ...')`).
 * @const
 */
var LeparaNodeExterns = {};
LeparaNodeExterns.spawnSync = function () {};
LeparaNodeExterns.shell;

/**
 * The part of Module.FS used by src/app/compute/compute.worker.ts and
 * scripts/run-wasm-node.ts. Emscripten keeps the FS export but not the names
 * of its methods (isDir was renamed: the browser run failed after the engine).
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
