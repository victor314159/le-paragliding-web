#!/usr/bin/env node
// Native Fortran 1.6 versus the TypeScript port, including unrounded curves and metrics.
// Usage: docker compose run --rm oracle node scripts/check-preprocessor-native.ts
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  generateGeometry,
  writePreData,
  type GeometryResult,
} from '../packages/preprocessor/src/index.ts';
import { ok, preprocessorCases } from '../tests/preprocessor/cases.ts';
import { ROOT, sha256 } from './oracle-lib.ts';
import { oracleCompiler } from './native-engine.ts';

const OUT = join(ROOT, 'build/preprocessor-native');
const SOURCE = join(ROOT, 'fortran/preprocessor/original/pre-processor.f');
const PATCHES = join(ROOT, 'fortran/preprocessor/patches');
const source = readFileSync(SOURCE);
if (sha256(source) !== '8f1dd2f3844150be247e9b86f87e4b14fb6d0402282beece4b28f2df1e75b9ef')
  throw new Error('Unexpected official preprocessor source');
mkdirSync(OUT, { recursive: true });
const generated = join(OUT, 'pre-processor.f');
writeFileSync(generated, source.toString('utf8').replace(/\r/g, ''));
for (const patch of readdirSync(PATCHES)
  .filter((name) => name.endsWith('.patch'))
  .sort()) {
  execFileSync('patch', ['--quiet', '--no-backup-if-mismatch', '-p1', '-d', OUT], {
    input: readFileSync(join(PATCHES, patch)),
  });
}
const bin = join(OUT, 'preprocessor');
execFileSync(
  oracleCompiler(),
  [
    '-std=legacy',
    // Match JavaScript numbers; verify the algorithm without float32 cancellation artifacts.
    '-fdefault-real-8',
    '-fdefault-double-8',
    '-fcheck=all',
    // Uninitialized REALs are signaling NaNs: using one raises the invalid
    // flag, which patch 006 checks at the end (traps are lost under emulation).
    '-finit-real=snan',
    generated,
    '-o',
    bin,
  ],
  { stdio: 'inherit' },
);

/** Ribs and curves in cm/degrees; metrics use m, m² and dimensionless ratios. */
const TOLERANCE = { absolute: 1e-7, relative: 1e-9 };
let maxCoordinateError = 0;
let maxAngleError = 0;
let maxMetricError = 0;

function compare(name: string, actual: GeometryResult, text: string): void {
  const records = text
    .trim()
    .split('\n')
    .map((line) => line.trim().split(/\s+/).map(Number));
  const header = records.shift()!;
  const counts = [
    actual.cells,
    actual.ribs.length,
    actual.curves.leadingEdge.length,
    actual.curves.trailingEdge.length,
    actual.curves.vault.length,
  ];
  if (JSON.stringify(header) !== JSON.stringify(counts))
    throw new Error(`[${name}] counts: native ${header.join(',')} / TS ${counts.join(',')}`);
  const row = (path: string, values: readonly number[], metric = false) => {
    const expected = records.shift();
    if (expected?.length !== values.length)
      throw new Error(`[${name}] ${path}: missing or malformed oracle row`);
    values.forEach((value, i) => {
      const native = expected[i];
      const delta = Math.abs(value - native);
      const angle = path.startsWith('ribs[') && i === 6;
      if (
        !Number.isFinite(native) ||
        !Number.isFinite(value) ||
        delta > TOLERANCE.absolute + TOLERANCE.relative * Math.abs(native)
      ) {
        throw new Error(
          `[${name}] ${path}[${i}]: native=${native}, TS=${value}, absolute error=${delta}`,
        );
      }
      if (metric) maxMetricError = Math.max(maxMetricError, delta);
      else if (angle) maxAngleError = Math.max(maxAngleError, delta);
      else maxCoordinateError = Math.max(maxCoordinateError, delta);
    });
  };
  actual.ribs.forEach((rib, i) =>
    row(`ribs[${i}]`, [
      rib.number,
      rib.x,
      rib.yLE,
      rib.yTE,
      rib.xp,
      rib.z,
      rib.beta,
      rib.rotationPoint,
      rib.washin,
    ]),
  );
  for (const key of ['leadingEdge', 'trailingEdge', 'vault'] as const)
    actual.curves[key].forEach((point, i) => row(`${key}[${i}]`, point));
  const m = actual.metrics;
  row(
    'metrics',
    [
      m.flatSpan,
      m.projectedSpan,
      m.flatArea,
      m.projectedArea,
      m.flatAspectRatio,
      m.projectedAspectRatio,
      m.flattening,
      m.maxChord,
      m.meanChord,
      m.minChord,
    ],
    true,
  );
  if (records.length) throw new Error(`[${name}] Unexpected trailing oracle records`);
}

let failed = false;
const cases = preprocessorCases();
for (const { name, input } of cases) {
  try {
    const dir = join(OUT, name);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'pre-data.txt'), ok(writePreData(input)));
    const run = spawnSync(bin, [], { cwd: dir, timeout: 10000, encoding: 'utf8' });
    writeFileSync(join(dir, 'stdout.log'), run.stdout ?? '');
    writeFileSync(join(dir, 'stderr.log'), run.stderr ?? '');
    if (run.error || run.status !== 0)
      throw new Error(`Native failed: ${run.error?.message ?? run.stderr}`);
    compare(name, ok(generateGeometry(input)), readFileSync(join(dir, 'oracle.txt'), 'utf8'));
    console.log(`[${name}] identical structure; all numbers within tolerance`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    failed = true;
  }
}
console.log(
  `Max absolute error: coordinates ${maxCoordinateError} cm; angles ${maxAngleError} deg; metrics ${maxMetricError}`,
);
console.log(`PREPROCESSOR NATIVE: ${failed ? 'RED' : 'GREEN'} (${cases.length} cases)`);
process.exit(failed ? 1 : 0);
