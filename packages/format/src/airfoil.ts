// Airfoil files, read as the engine reads them (section 6 of the program
// and its subroutine datair). The first line of both formats is skipped.
import { FortranReader, integer, real8 } from './fortran.ts';
import { attempt, failure, type Diagnostic, type Result } from './result.ts';
import { formatReal } from './writer.ts';

/** A point of an airfoil: x and y, in fractions of the chord. */
export type Point = readonly [x: number, y: number];

/**
 * An airfoil file. The engine picks the format from the last three
 * characters of the name: "txt" or "dat".
 */
export type LepAirfoil =
  /**
   * LEparagliding format: point counts, then `np(i,1)` points from the
   * trailing edge over the extrados, the air intake and the intrados. The
   * three parts share their end points.
   */
  | {
      readonly format: 'txt';
      /** Points on the extrados, `np(i,2)` (integer). */
      readonly extrados: number;
      /** Points on the air intake, `np(i,3)` (integer). */
      readonly inlet: number;
      /** Points on the intrados, `np(i,4)` (integer). */
      readonly intrados: number;
      /** `u(i,j,1)`, `v(i,j,1)`. Their number is `np(i,1)`. */
      readonly points: readonly Point[];
    }
  /**
   * Selig-style list of points, read until the end of the file. The engine
   * places the air intake itself, from section 2.
   */
  | { readonly format: 'dat'; readonly points: readonly Point[] };

/** The format the engine reads `name` with, from its last three characters. */
export function airfoilFormat(name: string): 'txt' | 'dat' | undefined {
  const end = name.replace(/ +$/, '').slice(-3);
  return end === 'txt' || end === 'dat' ? end : undefined;
}

/** Reads an airfoil file: `.txt` or `.dat`, from the end of `name`. */
export function parseAirfoil(name: string, text: string): Result<LepAirfoil> {
  const format = airfoilFormat(name);
  if (!format) {
    return failure([
      {
        severity: 'error',
        file: name,
        message: `The engine reads only airfoils whose name ends with "txt" or "dat": ${name}`,
      },
    ]);
  }
  return attempt((warnings) => {
    const r = new FortranReader(text, name, warnings);
    r.skip('the point counts');
    if (format === 'dat') {
      return { format, points: r.readPairsToEnd('u', (j) => `points[${j}]`) };
    }
    const [total] = r.read([integer('np(i,1)', 'points.length')]) as [number];
    if (total < 0)
      r.failHere(`Negative number of points: ${total}`, 'points.length', r.lineNumber - 1);
    const [extrados] = r.read([integer('np(i,2)', 'extrados')]) as [number];
    const [inlet] = r.read([integer('np(i,3)', 'inlet')]) as [number];
    const [intrados] = r.read([integer('np(i,4)', 'intrados')]) as [number];
    const points: Point[] = [];
    for (let j = 0; j < total; j++) {
      const [u, v] = r.read([
        real8('u(i,j,1)', `points[${j}][0]`),
        real8('v(i,j,1)', `points[${j}][1]`),
      ]) as [number, number];
      points.push([u, v]);
    }
    return { format, extrados, inlet, intrados, points };
  });
}

/**
 * Writes an airfoil file in its format, if it has no error. The engine
 * skips the first line: `title` (the airfoil's name, for other programs)
 * goes there, "Airfoil" by default.
 */
export function writeAirfoil(
  airfoil: LepAirfoil,
  options: { title?: string } = {},
): Result<string> {
  const { title = 'Airfoil' } = options;
  const diagnostics = validateAirfoil(airfoil);
  if (/[\r\n]/.test(title)) {
    diagnostics.push({ severity: 'error', message: 'The title is one line', field: 'title' });
  }
  const errors = diagnostics.filter((d) => d.severity === 'error');
  if (errors.length) return failure(errors);
  const points = airfoil.points.map(([u, v]) => `${formatReal(u)} ${formatReal(v)}`);
  const text =
    airfoil.format === 'txt'
      ? [
          title,
          String(airfoil.points.length),
          String(airfoil.extrados),
          String(airfoil.inlet),
          String(airfoil.intrados),
          ...points,
        ]
      : [title, ...points];
  return { ok: true, value: `${text.join('\n')}\n`, warnings: diagnostics };
}

// The engine's arrays u(0:100,500,99), v: 500 points per airfoil, and its
// loops over the points read (or write) the one after the last (9.2 of the
// program, the air inlet, on every rib); datair may add two points to a .dat
// airfoil.
export const MAX_TXT_POINTS = 499;
export const MAX_DAT_POINTS = 497;

/** Errors and warnings of one airfoil, `name` naming its file. */
export function validateAirfoil(airfoil: LepAirfoil, name?: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const add = (severity: Diagnostic['severity'], message: string, field?: string) =>
    diagnostics.push({
      severity,
      message,
      ...(name !== undefined && { file: name }),
      ...(field !== undefined && { field }),
    });
  airfoil.points.forEach(([u, v], j) => {
    if (!Number.isFinite(u) || !Number.isFinite(v)) {
      add('error', 'Coordinates must be finite numbers', `points[${j}]`);
    }
  });
  if (airfoil.format === 'dat') {
    if (airfoil.points.length < 3) add('error', 'A .dat airfoil needs at least 3 points', 'points');
    if (airfoil.points.length > MAX_DAT_POINTS) {
      add('error', `At most ${MAX_DAT_POINTS} points (the engine's arrays)`, 'points');
    }
    return diagnostics;
  }
  const total = airfoil.points.length;
  if (total < 3) add('error', 'A .txt airfoil needs at least 3 points', 'points');
  if (total > MAX_TXT_POINTS) {
    add('error', `At most ${MAX_TXT_POINTS} points (the engine's arrays)`, 'points');
  }
  for (const field of ['extrados', 'inlet', 'intrados'] as const) {
    const n = airfoil[field];
    if (!Number.isInteger(n) || n < 1 || n > total) {
      add('error', `Must be an integer from 1 to the number of points (${total})`, field);
    }
  }
  // The engine indexes the points with these counts (np(i,2)+np(i,3)-1…).
  if (airfoil.extrados + airfoil.inlet + airfoil.intrados !== total + 2) {
    add(
      'error',
      `extrados + inlet + intrados must be the number of points + 2 (shared end points): ${
        airfoil.extrados + airfoil.inlet + airfoil.intrados
      } for ${total} points`,
      'extrados',
    );
  }
  // Not an error: the official example swoop has none (gnuReflex.txt).
  if (!airfoil.points.some(([u, v]) => Math.abs(u) < 1e-4 && Math.abs(v) < 1e-4)) {
    add(
      'warning',
      'No nose point at (0, 0), within 0.0001: the engine then uses point 0, out of its arrays. Move the nearest point to (0, 0)',
      'points',
    );
  }
  return diagnostics;
}
