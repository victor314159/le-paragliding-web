// What the types cannot say: integers, bounds of each field, row counts,
// references between sections, the values the engine uses as array indices
// or divisors, and the airfoils of a project. Errors make writeLep refuse a
// design; warnings point at values outside what the manual documents.
import { airfoilFormat, validateAirfoil, type LepAirfoil } from './airfoil.ts';
import { byteLength } from './fortran.ts';
import type * as M from './model.ts';
import { DESIGN_FILE, halfWingRibs, SPECIAL } from './read-design.ts';
import type { Diagnostic } from './result.ts';

/** A design and its airfoils, by exact file name. Airfoils may be missing. */
export interface LepProject {
  readonly design: M.LepDesign;
  readonly airfoils: ReadonlyMap<string, LepAirfoil>;
}

/**
 * Every error and warning of a project: its design, its airfoils and their
 * links. `reading`, the diagnostics of reading its files (`readProject`),
 * come first: an airfoil with a reading error is not reported missing too.
 */
export function validate(
  project: LepProject,
  options: { reading?: readonly Diagnostic[] } = {},
): readonly Diagnostic[] {
  const { design, airfoils } = project;
  const { reading = [] } = options;
  const unreadable = new Set(
    reading.flatMap(({ severity, file }) =>
      severity === 'error' && file && file !== DESIGN_FILE ? [file] : [],
    ),
  );
  const diagnostics = [...reading, ...validateDesign(design)];
  diagnostics.push(...new ProjectChecker(design, airfoils, unreadable).run());
  for (const [name, airfoil] of airfoils) {
    if (!design.airfoils.some((row) => row.airfoil === name)) {
      diagnostics.push({ severity: 'warning', message: `Unused airfoil ${name}`, file: name });
    }
    diagnostics.push(...validateAirfoil(airfoil, name));
  }
  return diagnostics;
}

/** Errors and warnings of a design alone (its airfoils are not checked). */
export function validateDesign(design: M.LepDesign): Diagnostic[] {
  return new DesignChecker(design).run();
}

// Limits of the engine's arrays (build/fortran/leparagliding.f).
const MAX_HALF_WING_RIBS = 99; // rib(0:100,…), nomair(100) and the virtual rib nribss+1
const MAX_PLANS = 9; // cam(10): the brakes use slp+1
const MAX_PATHS = 100; // mc(10,100,50)
const MAX_LINES = 500; // corda(500,50)
const MAX_POINTS = 500; // u(0:100,500,99): points of an airfoil
// Section 37 values that size arrays: nsegments, k up to nsegments+1 in
// tesse3d(3,0:100,500,99); nelliref, nelliref+1 points in xe(500) and a
// division by nelliref.
const SPECIAL_RANGES: Readonly<Record<number, readonly [number, number]>> = {
  1291: [1, 98],
  3002: [1, 499],
};
// Section 37 modes: the engine has no branch for other values (no line
// drawn, no equilibrium solved, no summary written).
const SPECIAL_MODES: Readonly<Record<number, readonly number[]>> = {
  1341: [0, 1],
  1351: [1, 2, 3, 4, 5, 6],
  1353: [0, 1, 2],
};
// Section 37 values with documented choices: other values work as one of
// them (1352 as 2, 2005 and 2006 as 0).
const SPECIAL_CHOICES: Readonly<Record<number, readonly number[]>> = {
  1352: [1, 2],
  2005: [0, 1],
  2006: [0, 1],
};
// eslint-disable-next-line no-control-regex
const CONTROL = /[\x00-\x08\x0a-\x1f\x7f]/;

/** Diagnostics of one section at a time. */
class Checker {
  readonly diagnostics: Diagnostic[] = [];
  protected section = 1;

  protected add(severity: Diagnostic['severity'], field: string, message: string): void {
    this.diagnostics.push({ severity, message, file: DESIGN_FILE, section: this.section, field });
  }

  protected error(field: string, message: string): void {
    this.add('error', field, message);
  }

  protected warn(field: string, message: string): void {
    this.add('warning', field, message);
  }
}

class DesignChecker extends Checker {
  private readonly ribs: number;
  private readonly d: M.LepDesign;

  constructor(d: M.LepDesign) {
    super();
    this.d = d;
    // An invalid number of cells (reported by geometry()) gives no ribs.
    const cells = d.geometry.cells;
    const valid = Number.isInteger(cells) && cells >= 2 && cells <= 2 * MAX_HALF_WING_RIBS - 1;
    this.ribs = valid ? halfWingRibs(cells) : 0;
  }

  // --- helpers -----------------------------------------------------------------

  /** An INTEGER, optionally within [min, max]. False if not. */
  private int(field: string, value: number, min = -2147483648, max = 2147483647): boolean {
    if (!Number.isInteger(value)) {
      this.error(field, `Must be an integer: ${value}`);
      return false;
    }
    if (value < min || value > max) {
      this.error(field, `Must be from ${min} to ${max}: ${value}`);
      return false;
    }
    return true;
  }

  /** A REAL*8: finite. False if not. */
  private real(field: string, value: number): boolean {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      this.error(field, `Must be a finite number: ${value}`);
      return false;
    }
    return true;
  }

  /** The named reals of `object`, `field.key`. */
  private reals<T extends object>(
    field: string,
    object: T,
    keys: readonly (keyof T & string)[],
  ): void {
    for (const key of keys) this.real(`${field}.${key}`, object[key] as number);
  }

  /** The reals of a tuple, `field[k]`. */
  private tuple(field: string, values: readonly number[]): void {
    values.forEach((v, k) => this.real(`${field}[${k}]`, v));
  }

  /** A real that the engine divides by, or that must be positive. */
  private positive(field: string, value: number, why: string): void {
    if (this.real(field, value) && value <= 0)
      this.error(field, `Must be positive (${why}): ${value}`);
  }

  /** A documented choice: a warning outside it. */
  private choice(field: string, value: number, choices: readonly number[]): void {
    if (Number.isFinite(value) && !choices.includes(value)) {
      this.warn(field, `The manual documents ${choices.join(', ')}: ${value}`);
    }
  }

  /** A documented range: a warning outside it. */
  private range(field: string, value: number, min: number, max: number): void {
    if (Number.isFinite(value) && (value < min || value > max)) {
      this.warn(field, `Usually from ${min} to ${max}: ${value}`);
    }
  }

  /** A CHARACTER*length value that reads back unchanged. */
  private text(field: string, value: string, length: number, nonBlank = false): void {
    if (CONTROL.test(value))
      this.error(field, 'Must not contain line breaks or control characters');
    if (/ $/.test(value)) {
      this.error(field, 'Trailing blanks are not significant in Fortran: remove them');
    }
    if (byteLength(value) > length) this.error(field, `At most ${length} bytes: "${value}"`);
    if (nonBlank && value.trim() === '') this.error(field, 'Must not be blank');
  }

  /** A file name the engine opens: no folder, no leading blank. */
  private fileName(field: string, value: string): void {
    if (/[/\\]/.test(value)) this.error(field, `A file name without folders: ${value}`);
    if (/^ /.test(value)) this.error(field, `Leading blanks are part of the file name: "${value}"`);
  }

  /** A row count: exactly `expected`. */
  private rows(field: string, actual: number, expected: number, what: string): void {
    if (actual !== expected) {
      this.error(field, `${expected} rows expected (${what}), found ${actual}`);
    }
  }

  /** At most `max` items (an engine array). */
  private max(field: string, actual: number, max: number): void {
    if (actual > max) this.error(field, `At most ${max} (an array of the engine): ${actual}`);
  }

  /** A rib of the half wing, `min` to nribss (`max` for the virtual rib). */
  private rib(field: string, value: number, min = 1, max = this.ribs): void {
    if (this.int(field, value) && (value < min || value > max)) {
      this.error(field, `No rib ${value}: the half wing has ribs ${min} to ${max}`);
    }
  }

  private ribRange(
    field: string,
    group: { firstRib: number; lastRib: number },
    max = this.ribs,
  ): void {
    this.rib(`${field}.firstRib`, group.firstRib, 1, max);
    this.rib(`${field}.lastRib`, group.lastRib, 1, max);
    if (group.firstRib > group.lastRib) this.warn(field, 'The first rib is after the last one');
  }

  private mode(field: string, value: number, known: readonly number[]): void {
    if (!known.includes(value)) {
      this.error(field, `Unknown mode ${value}: expected ${known.join(', ')}`);
    }
  }

  private chord(rib: number): number {
    const r = this.d.geometry.ribs[rib - 1];
    return r ? r.yTE - r.yLE : NaN;
  }

  // --- sections -------------------------------------------------------------------

  run(): Diagnostic[] {
    const d = this.d;
    this.geometry(d.geometry);
    this.airfoils(d.airfoils);
    this.anchors(d.anchors);
    this.holes(d.holes);
    this.skinTension(d.skinTension);
    this.section = 6;
    const s = d.sewingAllowances;
    const sides = ['sides', 'leadingEdge', 'trailingEdge'] as const;
    this.reals('sewingAllowances.upper', s.upper, sides);
    this.reals('sewingAllowances.lower', s.lower, sides);
    this.reals('sewingAllowances', s, ['ribs', 'vRibs']);
    this.section = 7;
    this.reals('marks', d.marks, ['spacing', 'pointRadius', 'pointOffset']);
    this.section = 8;
    const a = d.angleOfAttack;
    this.reals('angleOfAttack', a, [
      'glideRatio',
      'centerOfPressure',
      'calage',
      'risersLength',
      'karabinerSeparation',
    ]);
    this.positive('angleOfAttack.linesLength', a.linesLength, 'the engine divides by it');
    this.lines(d.lines);
    this.brakes(d.brakes);
    this.lineCount(d.lines, d.brakes);
    this.section = 11;
    const r = d.ramifications;
    this.reals('ramifications.lines3', r.lines3, ['level', 'l2']);
    this.reals('ramifications.lines4', r.lines4, ['level', 'l3', 'l2']);
    this.reals('ramifications.brakes3', r.brakes3, ['level', 'l2']);
    this.reals('ramifications.brakes4', r.brakes4, ['level', 'l3', 'l2']);
    this.hvRibs(d.hvRibs);
    this.colors(15, 'extradosColors', d.extradosColors);
    this.colors(16, 'intradosColors', d.intradosColors);
    this.section = 17;
    this.max('ribPoints', d.ribPoints.length, 10);
    d.ribPoints.forEach((p, i) => this.tuple(`ribPoints[${i}]`, p));
    this.elasticLines(d.elasticLines);
    this.section = 19;
    this.max('dxfLayers', d.dxfLayers.length, 50);
    d.dxfLayers.forEach((name, i) => this.text(`dxfLayers[${i}]`, name, 50, true));
    this.markTypes(d.markTypes);
    this.joncs(d.joncs);
    this.noseMylars(d.noseMylars);
    this.section = 23;
    const tab = d.tabReinforcements.mode;
    if (this.int('tabReinforcements.mode', tab) && tab !== 0) {
      this.warn('tabReinforcements.mode', 'Still not functional in 3.29: the manual asks for 0');
    }
    this.dxf(d.dxf2d, d.dxf3d);
    this.glueVents(d.glueVents);
    this.wingTip(d.wingTip);
    this.calageVariation(d.calageVariation);
    this.shaping(d.shaping);
    this.thickness(d.thickness);
    this.skinTensionGroups(d.skinTensionGroups);
    this.partsSeparation(d.partsSeparation);
    this.risers(d.risers);
    this.lineTypes(d.lineTypes);
    this.equilibrium(d.equilibrium);
    this.xflr5(d.xflr5);
    this.specialParameters(d.specialParameters);
    this.hvrHoles(d.hvrHoles);
    this.hvrPositions(d.hvrPositions, d.hvrHoles.mode === 1);
    return this.diagnostics;
  }

  private geometry(g: M.Geometry): void {
    const f = 'geometry';
    this.section = 1;
    this.text(`${f}.brandName`, g.brandName, 50);
    this.text(`${f}.wingName`, g.wingName, 50);
    for (const key of ['drawingScale', 'wingScale'] as const) {
      this.positive(`${f}.${key}`, g[key], 'a scale');
    }
    // nribss=int(ncells/2.)+1 ribs, plus a virtual rib nribss+1 copied from nribss-1.
    this.int(`${f}.cells`, g.cells, 2, 2 * MAX_HALF_WING_RIBS - 1);
    if (this.int(`${f}.ribCount`, g.ribCount) && g.ribCount !== g.cells + 1) {
      this.warn(
        `${f}.ribCount`,
        `A wing of ${g.cells} cells usually has ${g.cells + 1} ribs: ${g.ribCount}`,
      );
    }
    const w = g.washin;
    this.mode(`${f}.washin.mode`, w.mode, [0, 1, 2]);
    this.real(`${f}.washin.maxAngle`, w.maxAngle);
    if (w.mode === 2) this.real(`${f}.washin.centerAngle`, w.centerAngle);
    // Modes 1 and 2 divide by the chord of the central rib minus the tip's.
    if ((w.mode === 1 || w.mode === 2) && this.ribs >= 1) {
      const span = this.chord(1) - this.chord(this.ribs);
      if (span === 0) {
        this.error(
          `${f}.washin.mode`,
          'Washin modes 1 and 2 need a tip chord different from the central chord (the engine divides by their difference)',
        );
      }
    }
    this.text(`${f}.paragliderType`, g.paragliderType, 2);
    if (!['ds', 'ss', 'pc', 'sk'].includes(g.paragliderType)) {
      this.error(
        `${f}.paragliderType`,
        `Unknown paraglider type "${g.paragliderType}": expected ds, ss, pc or sk`,
      );
    }
    if (this.int(`${f}.paragliderParameter`, g.paragliderParameter)) {
      this.choice(`${f}.paragliderParameter`, g.paragliderParameter, [0, 1]);
    }
    this.mode(`${f}.ribColumns`, g.ribColumns, [9, 11]);
    this.rows(`${f}.ribs`, g.ribs.length, this.ribs, `int(cells/2)+1 for ${g.cells} cells`);
    const keys = [
      'number',
      'x',
      'yLE',
      'yTE',
      'xp',
      'z',
      'beta',
      'rotationPoint',
      'washin',
    ] as const;
    g.ribs.forEach((r, i) => {
      const h = `${f}.ribs[${i}]`;
      this.reals(h, r, keys);
      if (g.ribColumns === 11) {
        if (r.rotZ === undefined || r.rotZPosition === undefined) {
          this.error(h, 'An 11-column rib table needs rotZ and rotZPosition');
        } else {
          this.reals(h, r, ['rotZ', 'rotZPosition']);
        }
      } else if (r.rotZ !== undefined || r.rotZPosition !== undefined) {
        this.error(h, 'rotZ and rotZPosition need an 11-column rib table');
      }
      // The engine divides by the chord, rib(i,5).
      if (r.yTE <= r.yLE) {
        this.error(h, `The trailing edge must be after the leading edge (chord ${r.yTE - r.yLE})`);
      }
    });
    // The brakes divide the x of each rib by the x of the last one.
    const last = g.ribs.at(-1);
    if (last && last.x === 0)
      this.error(
        `${f}.ribs[${g.ribs.length - 1}].x`,
        'The last rib cannot be at x = 0 (the engine divides by it)',
      );
  }

  private airfoils(rows: readonly M.AirfoilRow[]): void {
    this.section = 2;
    this.rows('airfoils', rows.length, this.ribs, 'one per rib of the half wing');
    rows.forEach((a, i) => {
      const f = `airfoils[${i}]`;
      this.text(`${f}.airfoil`, a.airfoil, 50, true);
      this.fileName(`${f}.airfoil`, a.airfoil);
      if (!airfoilFormat(a.airfoil)) {
        this.error(
          `${f}.airfoil`,
          `The engine reads only airfoils ending with "txt" or "dat": ${a.airfoil}`,
        );
      }
      this.reals(f, a, [
        'number',
        'intakeStart',
        'intakeEnd',
        'open',
        'displacement',
        'relativeWeight',
        'minirib',
      ]);
      this.choice(`${f}.open`, a.open, [0, 1]);
      this.range(`${f}.intakeStart`, a.intakeStart, 0, 100);
      this.range(`${f}.intakeEnd`, a.intakeEnd, 0, 100);
      if (a.intakeStart > a.intakeEnd)
        this.warn(`${f}.intakeEnd`, 'The air inlet ends before it starts');
    });
  }

  private anchors(rows: readonly M.AnchorRow[]): void {
    this.section = 3;
    this.rows('anchors', rows.length, this.ribs, 'one per rib of the half wing');
    // Ribs whose anchor F (row 6) is used: by the brakes, by H/V ribs.
    const brakeRibs = new Set([
      ...this.d.brakes.paths.flatMap((p) => [Math.trunc(p.anchorRib), Math.trunc(p.anchorRib) + 1]),
      ...this.d.hvRibs.ribs
        .flatMap(hvAnchors)
        .filter((a) => a.row === 6)
        .flatMap((a) => a.ribs.map((i) => Math.max(i, 1))),
    ]);
    rows.forEach((a, i) => {
      const f = `anchors[${i}]`;
      this.reals(f, a, ['number', 'count']);
      this.tuple(`${f}.positions`, a.positions);
      if (!Number.isInteger(a.count) || a.count < 0 || a.count > 6) {
        this.error(`${f}.count`, `Must be an integer from 0 to 6: ${a.count}`);
      }
      // The engine finds each anchor on the intrados at this % of the chord.
      a.positions.forEach((position, k) => {
        const used = k < a.count || (k === 5 && brakeRibs.has(i + 1));
        if (used && Number.isFinite(position) && (position < 0 || position > 100)) {
          this.error(
            `${f}.positions[${k}]`,
            `An anchor must be on the airfoil, 0 to 100 % of the chord: ${position}`,
          );
        }
      });
    });
  }

  private holes(groups: readonly M.HoleGroup[]): void {
    this.section = 4;
    groups.forEach((g, m) => {
      const f = `holes[${m}]`;
      // hol(0:100,200,20): the engine fills ribs firstRib to lastRib.
      this.int(`${f}.firstRib`, g.firstRib, 0, 100);
      this.int(`${f}.lastRib`, g.lastRib, 0, 100);
      if (g.firstRib > this.ribs || g.lastRib > this.ribs) {
        this.warn(f, `The half wing has ${this.ribs} ribs`);
      }
      this.max(`${f}.holes`, g.holes.length, 200);
      g.holes.forEach((h, l) => {
        if (this.real(`${f}.holes[${l}].type`, h.type)) {
          this.choice(`${f}.holes[${l}].type`, h.type, [1, 3, 4]);
        }
        this.tuple(`${f}.holes[${l}].parameters`, h.parameters);
      });
    });
  }

  private skinTension(s: M.SkinTension): void {
    this.section = 5;
    s.points.forEach((p, k) => this.skinPoint(`skinTension.points[${k}]`, p));
    this.real('skinTension.miniribStrain', s.miniribStrain);
    const { points, factor } = s.panelCorrection;
    // Other than 1000, it counts points back from the end of the extrados
    // and divides by the length of these points: 0 is 0/0.
    if (this.int('skinTension.panelCorrection.points', points) && points !== 1000 && points < 1) {
      this.error(
        'skinTension.panelCorrection.points',
        `Must be 1000 (no correction) or from 1 to the extrados points - 2: ${points}`,
      );
    }
    this.real('skinTension.panelCorrection.factor', factor);
  }

  private skinPoint(field: string, p: M.SkinTensionPoint): void {
    this.reals(field, p, [
      'extradosPosition',
      'extradosOverwidth',
      'intradosPosition',
      'intradosOverwidth',
    ]);
  }

  // Each (level, order) pair indexes the line arrays x1line(10,5,100)…
  // Pair k is at level k+1, the pairs past the levels are (0, 0), an order
  // hangs from one parent, and paths sharing a line follow each other: the
  // engine counts a line where the pair changes between consecutive paths.
  private paths(
    field: string,
    paths: readonly { levels: number; branches: readonly M.Branch[] }[],
  ): void {
    const parents = new Map<string, number>();
    const last = new Map<string, number>();
    paths.forEach((path, i) => {
      const f = `${field}[${i}]`;
      // With invalid levels (reported elsewhere), only the bounds.
      const levels = Number.isInteger(path.levels) && path.levels >= 1 && path.levels <= 5;
      path.branches.forEach(([level, order], k) => {
        const g = `${f}.branches[${k}]`;
        if (!this.int(`${g}[0]`, level, 0, 5) || !this.int(`${g}[1]`, order, 0, 100)) return;
        if (!levels) return;
        if (k < path.levels) {
          if (level !== k + 1)
            this.error(`${g}[0]`, `Pair ${k + 1} is at level ${k + 1}, not ${level}`);
          if (order < 1) this.error(`${g}[1]`, `A line order starts at 1: ${order}`);
          if (k > 0) {
            const key = `${k}:${order}`;
            const parent = path.branches[k - 1][1];
            if (parents.has(key) && parents.get(key) !== parent) {
              this.error(
                `${g}[1]`,
                `Line ${level}-${order} hangs from line ${level - 1}-${parents.get(key)} in an earlier path, not ${level - 1}-${parent}`,
              );
            }
            parents.set(key, parent);
          }
          const key = `${k}:${order}`;
          if (last.has(key) && last.get(key) !== i - 1) {
            this.error(
              `${g}[1]`,
              `The paths through line ${level}-${order} must follow each other: the engine counts a new line here`,
            );
          }
          last.set(key, i);
        } else if (level !== 0 || order !== 0) {
          this.error(g, `A path of ${path.levels} levels has (0, 0) here: (${level}, ${order})`);
        }
      });
    });
  }

  // The engine computes the anchors 1 to rib(i,15) of each rib (section 3);
  // row 6 (F, the brakes) has its own position, rib(i,21).
  private anchor(field: string, row: number, rib: number): boolean {
    if (!this.int(field, row, 1, 6)) return false;
    const count = this.d.anchors[rib - 1]?.count;
    if (row !== 6 && count !== undefined && row > count) {
      this.error(field, `Rib ${rib} has ${count} anchors (section 3): no anchor ${row}`);
      return false;
    }
    return true;
  }

  /** Line types of a row: explicit (typed rows) or 1 to levels; all in section 34. */
  private lineTypeRefs(
    field: string,
    typed: boolean,
    levels: number,
    lineTypes: readonly number[] | undefined,
  ): void {
    const known = this.knownLineTypes();
    if (!typed) {
      if (lineTypes !== undefined) {
        this.error(
          `${field}.lineTypes`,
          'Rows without line types (typed = false) cannot have lineTypes',
        );
      }
      // The engine gives level k the line type k (levels is checked elsewhere).
      const n = Number.isInteger(levels) ? Math.min(Math.max(levels, 0), 5) : 0;
      for (let k = 1; k <= n; k++) {
        if (!known.includes(k)) {
          this.error(
            `${field}.levels`,
            `Without line types, level ${k} uses line type ${k}: there is none in section 34`,
          );
        }
      }
      return;
    }
    if (!lineTypes) {
      this.error(`${field}.lineTypes`, 'Typed rows need lineTypes');
      return;
    }
    if (lineTypes.length !== levels) {
      this.error(
        `${field}.lineTypes`,
        `One line type per level: ${levels} expected, found ${lineTypes.length}`,
      );
    }
    lineTypes.forEach((type, k) => {
      if (this.int(`${field}.lineTypes[${k}]`, type) && !known.includes(type)) {
        this.error(`${field}.lineTypes[${k}]`, `No line type ${type} in section 34`);
      }
    });
  }

  private knownLineTypes(): number[] {
    const table = this.d.lineTypes;
    return table.mode === 1 ? table.types.map((t) => t.number) : [1, 2, 3, 4, 5, 6];
  }

  private lines(l: M.Lines): void {
    this.section = 9;
    if (this.real('lines.weighting', l.weighting))
      this.choice('lines.weighting', l.weighting, [0, 1, 2, 3]);
    if (l.plans.length < 1 || l.plans.length > MAX_PLANS) {
      this.error('lines.plans', `1 to ${MAX_PLANS} line plans: ${l.plans.length}`);
    }
    if (l.plans[0]?.paths.length === 0) {
      this.error(
        'lines.plans[0].paths',
        'The first plan needs a path: its first row decides the layout of the section',
      );
    }
    const first = l.plans[0]?.paths[0];
    if (!l.typed && first?.levels === 5) {
      this.error(
        'lines.plans[0].paths[0].levels',
        'Without line types, the first path cannot have 5 levels: its 13 values would make the engine expect line types',
      );
    }
    l.plans.forEach((plan, ii) => {
      const field = `lines.plans[${ii}].paths`;
      this.max(field, plan.paths.length, MAX_PATHS);
      plan.paths.forEach((path, i) => {
        const f = `${field}[${i}]`;
        if (this.int(`${f}.levels`, path.levels, l.typed ? 2 : 1, l.typed ? 4 : 5)) {
          const pairs = path.levels === 5 ? 5 : 4;
          if (path.branches.length !== pairs) {
            this.error(
              `${f}.branches`,
              `${pairs} level-order pairs expected, found ${path.branches.length}`,
            );
          }
        }
        this.rib(`${f}.anchorRib`, path.anchorRib);
        this.anchor(`${f}.anchorRow`, path.anchorRow, path.anchorRib);
        this.lineTypeRefs(f, l.typed, path.levels, path.lineTypes);
      });
      this.paths(field, plan.paths);
    });
  }

  private brakes(b: M.Brakes): void {
    this.section = 10;
    this.real('brakes.length', b.length);
    this.max('brakes.paths', b.paths.length, MAX_PATHS);
    if (b.typed && b.paths.length === 0) {
      this.error('brakes.typed', 'Without brake paths, there is no row to carry line types');
    }
    b.paths.forEach((path, i) => {
      const f = `brakes.paths[${i}]`;
      // Brake rows have 4 level-order pairs.
      this.int(`${f}.levels`, path.levels, b.typed ? 2 : 1, 4);
      if (this.real(`${f}.anchorRib`, path.anchorRib)) {
        const rib = Math.trunc(path.anchorRib);
        if (rib < 1 || rib > this.ribs) {
          this.error(`${f}.anchorRib`, `No rib ${rib}: the half wing has ribs 1 to ${this.ribs}`);
        } else {
          this.anchor(`${f}.anchorRow`, path.anchorRow, rib);
        }
      }
      this.lineTypeRefs(f, b.typed, path.levels, path.lineTypes);
    });
    this.paths('brakes.paths', b.paths);
    // Without line types, the engine gives the main brake line type 6.
    if (!b.typed && b.paths.length && !this.knownLineTypes().includes(6)) {
      this.error(
        'brakes.typed',
        'Without line types, the main brake line uses line type 6: there is none in section 34',
      );
    }
    this.tuple('brakes.distributionSpans', b.distributionSpans);
    this.tuple('brakes.distributionIncrements', b.distributionIncrements);
    // The engine interpolates between consecutive spans, dividing by their difference.
    b.distributionSpans.forEach((span, k) => {
      const previous = b.distributionSpans[k - 1];
      if (previous !== undefined && !(span > previous)) {
        this.error(
          `brakes.distributionSpans[${k}]`,
          `The spans must increase: ${previous} then ${span}`,
        );
      }
    });
  }

  // corda(500,50) holds every line, brakes included; the engine also uses
  // line cordam+1 (the main brake) when the brakes make no line.
  private lineCount(l: M.Lines, b: M.Brakes): void {
    const lines = countLines(
      l.plans.map((plan) => plan.paths),
      true,
    );
    const total = lines + countLines([b.paths], false);
    this.section = 9;
    if (total > MAX_LINES) {
      this.error(
        'lines.plans',
        `The engine holds at most ${MAX_LINES} lines, brakes included: these paths make ${total} (${lines} without the brakes)`,
      );
    } else if (lines >= MAX_LINES) {
      this.error(
        'lines.plans',
        `The engine holds at most ${MAX_LINES} lines and uses the one after the line plans for the main brake: these plans make ${lines}`,
      );
    }
  }

  private hvRibs(h: M.HvRibs): void {
    this.section = 12;
    this.reals('hvRibs', h, ['separationX', 'separationY']);
    this.max('hvRibs.ribs', h.ribs.length, 200);
    h.ribs.forEach((r, i) => {
      const f = `hvRibs.ribs[${i}]`;
      this.real(`${f}.number`, r.number);
      if (![1, 2, 3, 4, 5, 6, 11, 12, 13, 14, 15, 16].includes(r.type)) {
        this.error(`${f}.type`, `Unknown type ${r.type}: expected 1 to 6 or 11 to 16`);
      }
      const n = r.type === 6 || r.type === 16 ? 10 : 8;
      if (r.parameters.length !== n) {
        this.error(
          `${f}.parameters`,
          `Type ${r.type} has ${n} parameters (columns 3 to ${n + 2}), found ${r.parameters.length}`,
        );
      }
      this.tuple(`${f}.parameters`, r.parameters);
      const p = (k: number) => `${f}.parameters[${k}]`;
      // Types 6 and 16: columns 3 and 8 are its two ribs.
      if (r.type === 6 || r.type === 16) {
        if (r.parameters[0] !== undefined) this.rib(p(0), r.parameters[0], 0);
        if (r.parameters[5] !== undefined) this.rib(p(5), r.parameters[5], 0);
        return;
      }
      // Types 1 to 5 place themselves on anchors u(i,ii,6), which the
      // engine computes on ribs 0 to nribss only (rib 0 is rib 1).
      for (const { column, ribs, row } of hvAnchors(r)) {
        const ribOk = this.int(p(column), r.parameters[column]);
        const inside = ribOk && ribs.every((i) => i >= 0 && i <= this.ribs);
        if (ribOk && !inside) {
          this.error(
            p(column),
            `Type ${r.type} on rib ${r.parameters[column]} uses ribs ${ribs.join(', ')}: the engine has anchors on ribs 0 to ${this.ribs}`,
          );
        }
        if (this.int(p(column + 1), row, 1, 6) && inside) {
          ribs.every((i) => this.anchor(p(column + 1), row, Math.max(i, 1)));
        }
      }
    });
  }

  private colors(section: number, f: string, c: M.Colors): void {
    this.section = section;
    if (c.mode === 'ribs') {
      this.max(`${f}.ribs`, c.ribs.length, 100);
      c.ribs.forEach((rib, k) => {
        const g = `${f}.ribs[${k}]`;
        this.rib(`${g}.rib`, rib.rib, 0);
        this.max(`${g}.marks`, rib.marks.length, 100);
        rib.marks.forEach((m, l) => {
          this.int(`${g}.marks[${l}].number`, m.number);
          this.tuple(`${g}.marks[${l}].positions`, m.positions);
        });
      });
      return;
    }
    this.max(`${f}.panels`, c.panels.length, 100);
    c.panels.forEach((panel, k) => {
      const g = `${f}.panels[${k}]`;
      // The panel between ribs panel-1 and panel.
      this.rib(`${g}.panel`, panel.panel);
      this.max(`${g}.cuts`, panel.cuts.length, 100);
      panel.cuts.forEach((cut, l) => {
        this.int(`${g}.cuts[${l}].number`, cut.number);
        this.reals(`${g}.cuts[${l}]`, cut, ['left', 'right', 'seamWidth', 'unused']);
      });
    });
  }

  private elasticLines(e: M.ElasticLines): void {
    this.section = 18;
    this.real('elasticLines.flightLoad', e.flightLoad);
    e.distribution.forEach((row, k) => this.tuple(`elasticLines.distribution[${k}]`, row));
    e.deformation.forEach((row, k) => {
      const f = `elasticLines.deformation[${k}]`;
      this.reals(f, row, ['lines', 'lower', 'medium', 'higher']);
      this.choice(`${f}.lines`, row.lines, [1, 2, 3, 4, 5]);
    });
  }

  private markTypes(types: readonly M.MarkType[]): void {
    this.section = 20;
    this.max('markTypes', types.length, 50);
    // The engine uses mark types 1 to 10 (typm1(10)…), read or not.
    if (types.length < 10)
      this.error('markTypes', `The engine uses the mark types 1 to 10: ${types.length} given`);
    types.forEach((m, i) => {
      for (const side of ['print', 'laser'] as const) {
        const f = `markTypes[${i}].${side}`;
        this.int(`${f}.type`, m[side].type);
        this.reals(f, m[side], ['size', 'offset']);
      }
    });
  }

  private ribGroup(f: string, g: M.RibGroup): void {
    this.int(`${f}.group`, g.group);
    this.ribRange(f, g);
  }

  private joncs(j: M.Joncs): void {
    this.section = 21;
    this.mode('joncs.mode', j.mode, [0, 1, 2]);
    const curve = (f: string, c: M.RodCurve) =>
      this.reals(f, c, ['from', 'to', 'deflection', 'exponent']);
    const pocket = (f: string, p: M.RodPocket) =>
      this.reals(f, p, ['offset', 'outerWidth', 'rodWidth', 'innerWidth']);
    const nose = (f: string, g: M.NoseRodGroup) => {
      this.ribGroup(f, g);
      curve(`${f}.extrados`, g.extrados);
      curve(`${f}.intrados`, g.intrados);
      pocket(`${f}.pocket`, g.pocket);
    };
    if (j.mode === 1) {
      this.max('joncs.groups', j.groups.length, 100);
      j.groups.forEach((g, ng) => nose(`joncs.groups[${ng}]`, g));
    }
    if (j.mode !== 2) return;
    this.max('joncs.blocs', j.blocs.length, 20);
    j.blocs.forEach((bloc, m) => {
      const f = `joncs.blocs[${m}]`;
      this.int(`${f}.number`, bloc.number);
      this.mode(`${f}.type`, bloc.type, [1, 2, 3, 4, 5]);
      this.max(`${f}.groups`, bloc.groups.length, 100);
      const g = (ng: number) => `${f}.groups[${ng}]`;
      if (bloc.type === 1) bloc.groups.forEach((group, ng) => nose(g(ng), group));
      if (bloc.type === 2) {
        bloc.groups.forEach((group, ng) => {
          this.ribGroup(g(ng), group);
          this.reals(g(ng), group, ['x1', 'y1', 'x2', 'y2', 'deflection']);
          pocket(`${g(ng)}.pocket`, group.pocket);
        });
      }
      if (bloc.type === 3) {
        bloc.groups.forEach((group, ng) => {
          this.ribGroup(g(ng), group);
          for (const key of ['extrados', 'upperRod', 'lowerRod', 'intrados'] as const) {
            curve(`${g(ng)}.${key}`, group[key]);
          }
          pocket(`${g(ng)}.pocket`, group.pocket);
        });
      }
      if (bloc.type === 4 || bloc.type === 5) {
        bloc.groups.forEach((group, ng) => {
          this.ribGroup(g(ng), group);
          curve(`${g(ng)}.initial`, group.initial);
          curve(`${g(ng)}.final`, group.final);
          pocket(`${g(ng)}.pocket`, group.pocket);
        });
      }
    });
  }

  private noseMylars(n: M.NoseMylars): void {
    this.section = 22;
    this.mode('noseMylars.mode', n.mode, [0, 1]);
    if (n.mode !== 1) return;
    this.max('noseMylars.groups', n.groups.length, 100);
    n.groups.forEach((g, ng) => {
      this.ribGroup(`noseMylars.groups[${ng}]`, g);
      this.tuple(`noseMylars.groups[${ng}].values`, g.values);
    });
  }

  private dxf(d2: M.Dxf2d, d3: M.Dxf3d): void {
    const colors = (f: string, values: readonly number[]) =>
      values.forEach((c, k) => {
        if (this.int(`${f}[${k}]`, c)) this.range(`${f}[${k}]`, c, 0, 256);
      });
    this.section = 24;
    this.mode('dxf2d.mode', d2.mode, [0, 1]);
    if (d2.mode === 1) colors('dxf2d.lineColors', d2.lineColors);
    this.section = 25;
    this.mode('dxf3d.mode', d3.mode, [0, 1]);
    if (d3.mode !== 1) return;
    colors('dxf3d.lineColors', d3.lineColors);
    d3.surfaces.forEach((s, k) => {
      const f = `dxf3d.surfaces[${k}]`;
      if (this.int(`${f}.drawn`, s.drawn)) this.choice(`${f}.drawn`, s.drawn, [0, 1]);
      if (this.int(`${f}.color`, s.color)) this.range(`${f}.color`, s.color, 0, 256);
    });
  }

  private glueVents(v: M.GlueVents): void {
    this.section = 26;
    this.mode('glueVents.mode', v.mode, [0, 1]);
    if (v.mode !== 1) return;
    this.rows('glueVents.ribs', v.ribs.length, this.ribs, 'one per rib of the half wing');
    v.ribs.forEach((vent, i) => {
      const f = `glueVents.ribs[${i}]`;
      if (this.real(`${f}.type`, vent.type)) {
        this.choice(`${f}.type`, vent.type, [0, 1, -1, -2, -3, 4, -4, 5, -5, 6, -6]);
      }
      const t = Math.abs(vent.type);
      const n = t === 4 || t === 6 ? 2 : t === 5 ? 3 : 0;
      if (vent.parameters.length !== n) {
        this.error(
          `${f}.parameters`,
          `Type ${vent.type} has ${n} parameters, found ${vent.parameters.length}`,
        );
      }
      this.tuple(`${f}.parameters`, vent.parameters);
    });
  }

  private wingTip(w: M.WingTip): void {
    this.section = 27;
    this.mode('wingTip.mode', w.mode, [0, 1, 2, 4]);
    if (w.mode === 1) this.reals('wingTip', w, ['angleLE', 'angleTE']);
    if (w.mode === 2) this.reals('wingTip', w, ['distance', 'angle']);
    if (w.mode === 4) this.reals('wingTip', w, ['displacement', 'rotation']);
  }

  private calageVariation(c: M.CalageVariation): void {
    this.section = 28;
    this.mode('calageVariation.mode', c.mode, [0, 1]);
    if (c.mode !== 1) return;
    // p28(nriser28) is one of the 6 positions read; the engine handles 2 to 4.
    if (this.int('calageVariation.risers', c.risers, 1, 6)) {
      this.choice('calageVariation.risers', c.risers, [2, 3, 4]);
    }
    this.tuple('calageVariation.positions', c.positions);
    this.reals('calageVariation', c, ['speedAngle', 'trimAngle']);
    // Steps j=1..n+1 fill arrays of 100 (alpha28, calagnew…), after a division by n.
    this.int('calageVariation.speedSteps', c.speedSteps, 1, 99);
    this.int('calageVariation.trimSteps', c.trimSteps, 1, 99);
  }

  private shaping(s: M.Shaping): void {
    this.section = 29;
    this.mode('shaping.mode', s.mode, [0, 1, 2]);
    if (s.mode === 0) return;
    this.int('shaping.model', s.model);
    this.max('shaping.groups', s.groups.length, 200);
    s.groups.forEach((g, ng) => {
      const f = `shaping.groups[${ng}]`;
      // The engine reads a rib's cuts from the group number it gives the
      // rib, rib(i,169): a group of this section, or 0 for none.
      this.int(`${f}.group`, g.group, 0, s.groups.length);
      this.ribRange(f, g);
      for (const [side, max] of [
        ['upper', 2],
        ['lower', 1],
      ] as const) {
        const surface = g[side];
        const h = `${f}.${side}`;
        this.int(`${h}.type`, surface.type);
        // Type 2 reads its cut points into xiupp and xilow, never used: the
        // engine then works as type 1 with iupp(c,2..3) unset (0), out of
        // the airfoil (the native build crashes).
        if (s.mode === 2 && surface.cuts.length) {
          this.error(
            `${h}.cuts`,
            'Type 2 ignores the cut points it reads: the engine then uses unset points. Use type 1',
          );
        }
        if (surface.cuts.length > max)
          this.error(`${h}.cuts`, `At most ${max} cuts: ${surface.cuts.length}`);
        surface.cuts.forEach((cut, c) => {
          const k = `${h}.cuts[${c}]`;
          this.int(`${k}.number`, cut.number);
          // Points of the airfoil, v(i,j,53) (500 per rib), bounds of a loop.
          const ok =
            this.int(`${k}.start`, cut.start, 1, MAX_POINTS) &&
            this.int(`${k}.end`, cut.end, 1, MAX_POINTS);
          if (ok && cut.start >= cut.end)
            this.error(`${k}.end`, `The cut ends after it starts: ${cut.start} then ${cut.end}`);
          this.real(`${k}.depth`, cut.depth);
        });
      }
    });
    for (const [key, row] of Object.entries(s.print)) {
      const f = `shaping.print.${key}`;
      const print = row as M.PrintRange;
      if (this.int(`${f}.draw`, print.draw)) this.choice(`${f}.draw`, print.draw, [0, 1]);
      if (this.int(`${f}.oneSide`, print.oneSide))
        this.choice(`${f}.oneSide`, print.oneSide, [0, 1]);
      // The STL export iterates panels first to last, in tesse3d(3,0:100,…).
      const max = key === 'stl' ? this.ribs + 1 : undefined;
      const first = this.int(`${f}.first`, print.first, max === undefined ? undefined : 0, max);
      const ok = this.int(`${f}.last`, print.last, max === undefined ? undefined : 0, max) && first;
      // The tessellation covers panels 1 to nribss: the others are written
      // with all their vertices at 0 (A8 and gnuA7-26 export panel nribss+1).
      if (ok && key === 'stl' && print.draw === 1 && (print.first < 1 || print.last > this.ribs)) {
        this.warn(
          f,
          `The engine computes panels 1 to ${this.ribs}: panels ${print.first} to ${print.last} include panels written with all their vertices at 0`,
        );
      }
    }
  }

  private thickness(t: M.Thickness): void {
    this.section = 30;
    this.mode('thickness.mode', t.mode, [0, 1]);
    if (t.mode !== 1) return;
    this.rows('thickness.ribs', t.ribs.length, this.ribs, 'one per rib of the half wing');
    this.tuple('thickness.ribs', t.ribs);
  }

  private skinTensionGroups(s: M.SkinTensionGroups): void {
    this.section = 31;
    this.mode('skinTensionGroups.mode', s.mode, [0, 1]);
    if (s.mode !== 1) return;
    // The points of each rib, skinpoints(i): the last group wins.
    const counts = new Map<number, number>();
    s.groups.forEach((g, ng) => {
      const f = `skinTensionGroups.groups[${ng}]`;
      this.int(`${f}.group`, g.group);
      if (this.int(`${f}.type`, g.type)) this.choice(`${f}.type`, g.type, [1]);
      // skinpoints(0:100), skinnew(0:100,101,10): up to the virtual rib.
      this.ribRange(f, g, this.ribs + 1);
      // The engine interpolates between points k and k+1, k up to the
      // number of points, in xsobnew(0:100,101).
      if (g.points.length < 2 || g.points.length > 100) {
        this.error(`${f}.points`, `2 to 100 points: ${g.points.length}`);
      }
      g.points.forEach((p, k) => this.skinPoint(`${f}.points[${k}]`, p));
      for (let i = Math.max(g.firstRib, 1); i <= Math.min(g.lastRib, this.ribs); i++) {
        counts.set(i, g.points.length);
      }
    });
    const missing = Array.from({ length: this.ribs }, (_, i) => i + 1).filter(
      (i) => !counts.has(i),
    );
    if (missing.length) {
      this.error(
        'skinTensionGroups.groups',
        `Ribs ${missing.join(', ')} are in no group: the engine reads their points from index 0`,
      );
      return;
    }
    if (!s.groups.length) return;
    // The right side of the panel after rib i uses the points of rib i+1,
    // counted with the points of rib i.
    for (let i = 1; i < this.ribs; i++) {
      if (counts.get(i + 1)! < counts.get(i)!) {
        this.error(
          'skinTensionGroups.groups',
          `Rib ${i + 1} has fewer points (${counts.get(i + 1)}) than rib ${i} (${counts.get(i)}): the engine reads points of rib ${i + 1} before its first`,
        );
      }
    }
    // Rib 0 copies rib 1's count but only the points of the last group read.
    const last = s.groups.at(-1)!.points.length;
    if (counts.get(1)! > last) {
      this.error(
        'skinTensionGroups.groups',
        `Rib 0 copies the ${counts.get(1)} points of rib 1 from the last group, which has ${last}: the engine uses unset points`,
      );
    }
  }

  private partsSeparation(p: M.PartsSeparation): void {
    this.section = 32;
    this.mode('partsSeparation.mode', p.mode, [0, 1]);
    if (p.mode !== 1) return;
    this.reals('partsSeparation', p, [
      'panelX',
      'panelXMin',
      'panelY',
      'ribX',
      'ribY',
      'rib1Y',
      'joncX',
      'joncY',
      'joncI',
      'parameter10',
    ]);
  }

  private risers(r: M.Risers): void {
    this.section = 33;
    this.mode('risers.mode', r.mode, [0, 1]);
    // Mode 0 gives the length of section 8 to x33(1..5) only.
    const plans = this.d.lines.plans.length;
    if (r.mode === 0 && plans > 5) {
      this.error(
        'risers.mode',
        `Mode 0 sets the length of risers 1 to 5: the ${plans} line plans need mode 1 with their lengths`,
      );
    }
    if (r.mode !== 1) return;
    this.mode('risers.type', r.type, [1, 2, 3, 4]);
    if (r.type === 1) {
      this.rows(
        'risers.lengths',
        r.lengths.length,
        this.d.lines.plans.length,
        'one per line plan of section 9',
      );
      this.tuple('risers.lengths', r.lengths);
    } else {
      this.warn(
        'risers.type',
        'Vario seat risers are not available in 3.29: the engine gives every riser a length of 0',
      );
    }
  }

  private lineTypes(l: M.LineTypes): void {
    this.section = 34;
    this.mode('lineTypes.mode', l.mode, [0, 1]);
    if (l.mode !== 1) return;
    this.max('lineTypes.types', l.types.length, 50);
    l.types.forEach((t, i) => {
      const f = `lineTypes.types[${i}]`;
      // The engine stores type i in row i and looks types up by number
      // (tyline(type,…)): the numbers must be 1, 2, 3… in order.
      if (this.int(`${f}.number`, t.number) && t.number !== i + 1) {
        this.error(
          `${f}.number`,
          `Type ${i + 1} of the table must be numbered ${i + 1}: ${t.number}`,
        );
      }
      if (t.kind !== 'r' && t.kind !== 'c') {
        this.error(`${f}.kind`, `Unknown kind ${String((t as { kind: unknown }).kind)}`);
      }
      for (const key of ['name', 'material', 'loopType'] as const)
        this.text(`${f}.${key}`, t[key], 30, true);
      if (t.loopType !== 's' && t.loopType !== 'p') {
        this.warn(
          `${f}.loopType`,
          `The manual documents s (stitched) and p (spliced): ${t.loopType}`,
        );
      }
      if (t.kind === 'r') this.reals(f, t, ['width', 'thickness']);
      if (t.kind === 'c') this.reals(f, t, ['diameter']);
      this.reals(f, t, ['strength', 'weight', 'loopLength', 'color']);
    });
  }

  private equilibrium(q: M.Equilibrium): void {
    this.section = 35;
    this.mode('equilibrium.mode', q.mode, [0, 1]);
    if (q.mode !== 1) return;
    this.reals('equilibrium', q, [
      'alpha',
      'cl',
      'cle',
      'cm',
      'pilotSurface',
      'pilotDrag',
      'pilotMassCenter',
      'ycp',
      'zcp',
    ]);
    // The engine divides by these (the speed through the Reynolds numbers).
    for (const key of ['gravity', 'airDensity', 'viscosity', 'speed', 'cd', 'cde'] as const) {
      this.positive(`equilibrium.${key}`, q[key], 'the engine divides by it');
    }
    for (const key of ['wingMass', 'pilotMass', 'quickLinkMass'] as const) {
      if (this.real(`equilibrium.${key}`, q[key]) && q[key] <= 0) {
        this.warn(`equilibrium.${key}`, `A mass is positive: ${q[key]}`);
      }
    }
  }

  private xflr5(x: M.Xflr5): void {
    this.section = 36;
    this.mode('xflr5.mode', x.mode, [0, 1]);
    if (x.mode !== 1) return;
    for (const [key, value] of Object.entries(x.panels)) this.int(`xflr5.panels.${key}`, value);
    this.int('xflr5.billowed', x.billowed);
    const name = this.d.geometry.wingName;
    if (name.trim() === '') {
      this.error(
        'geometry.wingName',
        'Section 36 names its .xwimp file after the wing: it must not be blank',
      );
    }
    this.fileName('geometry.wingName', name);
    // The dihedral divides by the x' difference of consecutive ribs.
    this.d.geometry.ribs.forEach((rib, i) => {
      const next = this.d.geometry.ribs[i + 1];
      if (next && next.xp === rib.xp) {
        this.error(
          `geometry.ribs[${i + 1}].xp`,
          "Section 36 needs consecutive ribs at different x' (the engine divides by the difference)",
        );
      }
    });
  }

  private specialParameters(s: M.SpecialParameters): void {
    this.section = 37;
    this.mode('specialParameters.mode', s.mode, [0, 1]);
    if (s.mode !== 1) return;
    this.max('specialParameters.entries', s.entries.length, 250);
    s.entries.forEach((e, i) => {
      const f = `specialParameters.entries[${i}]`;
      if (e.code === 3001) {
        this.mode(`${f}.transition`, e.transition, [1, 2, 3]);
        this.tuple(`${f}.values`, e.values);
        return;
      }
      const type = SPECIAL[e.code]?.[0];
      if (!type) {
        this.error(`${f}.code`, `Unknown code ${String(e.code)}`);
      } else if (type === 'character') {
        this.text(`${f}.value`, e.value as string, 30);
      } else if (type === 'integer') {
        const [min, max] = SPECIAL_RANGES[e.code] ?? [];
        const value = e.value as number;
        if (!this.int(`${f}.value`, value, min, max)) return;
        if (SPECIAL_MODES[e.code]) this.mode(`${f}.value`, value, SPECIAL_MODES[e.code]);
        if (SPECIAL_CHOICES[e.code]) this.choice(`${f}.value`, value, SPECIAL_CHOICES[e.code]);
      } else {
        this.real(`${f}.value`, e.value as number);
      }
    });
  }

  private hvrHoles(h: M.HvrHoles): void {
    this.section = 38;
    this.mode('hvrHoles.mode', h.mode, [0, 1]);
    if (h.mode !== 1) return;
    this.max('hvrHoles.rows', h.rows.length, 100);
    h.rows.forEach((row, k) => {
      const f = `hvrHoles.rows[${k}]`;
      this.reals(f, row, ['height', 'width', 'center', 'offset', 'unused']);
      // Integers in the manual; the engine compares and truncates them.
      for (const key of ['number', 'type', 'drawn', 'holes'] as const)
        this.int(`${f}.${key}`, row[key]);
      this.choice(`${f}.type`, row.type, [5, 6, 9, 15, 16]);
      this.choice(`${f}.drawn`, row.drawn, [0, 1]);
      if (row.holes < 0) this.error(`${f}.holes`, `Cannot be negative: ${row.holes}`);
    });
  }

  private hvrPositions(h: M.HvrPositions, holes: boolean): void {
    this.section = 39;
    this.mode('hvrPositions.mode', h.mode, [0, 1]);
    if (h.coefficients && !holes) {
      this.error(
        'hvrPositions.coefficients',
        'The engine reads them only when section 38 is active',
      );
    }
    if (!h.coefficients && holes) {
      this.error('hvrPositions.coefficients', 'Section 38 is active: the engine reads them');
    }
    if (h.mode === 1 && !holes) {
      this.error(
        'hvrPositions.mode',
        'Mode 1 without section 38: the engine neither reads nor sets the coefficients',
      );
    }
    h.coefficients?.forEach((c, k) =>
      this.reals(`hvrPositions.coefficients[${k}]`, c, ['horizontal', 'vertical']),
    );
  }
}

/** What depends on the airfoils of a project. */
class ProjectChecker extends Checker {
  private readonly design: M.LepDesign;
  private readonly airfoils: ReadonlyMap<string, LepAirfoil>;
  /** Airfoils whose reading errors already explain their absence. */
  private readonly unreadable: ReadonlySet<string>;

  constructor(
    design: M.LepDesign,
    airfoils: ReadonlyMap<string, LepAirfoil>,
    unreadable: ReadonlySet<string>,
  ) {
    super();
    this.design = design;
    this.airfoils = airfoils;
    this.unreadable = unreadable;
  }

  /** The airfoil of rib `rib` (1-based), if present. */
  private airfoil(rib: number): { name: string; airfoil: LepAirfoil } | undefined {
    const name = this.design.airfoils[rib - 1]?.airfoil;
    const airfoil = name === undefined ? undefined : this.airfoils.get(name);
    return airfoil && { name: name, airfoil };
  }

  run(): Diagnostic[] {
    this.section = 2;
    const seen = new Set<string>();
    this.design.airfoils.forEach((row, i) => {
      const field = `airfoils[${i}].airfoil`;
      const airfoil = this.airfoils.get(row.airfoil);
      if (!airfoil) {
        if (!seen.has(row.airfoil) && !this.unreadable.has(row.airfoil))
          this.error(field, `Missing airfoil ${row.airfoil}`);
        seen.add(row.airfoil);
        return;
      }
      const format = airfoilFormat(row.airfoil);
      if (!seen.has(row.airfoil)) {
        if (format && airfoil.format !== format) {
          this.error(
            field,
            `${row.airfoil} holds a .${airfoil.format} airfoil: the engine reads it as .${format}`,
          );
        }
        if (airfoil.format === 'dat' && this.design.xflr5.mode === 1) {
          this.error(
            field,
            `${row.airfoil} is a .dat airfoil: section 36 (XFLR5) reads every airfoil as .txt and fails on it`,
          );
        }
      }
      seen.add(row.airfoil);
      if (airfoil.format === 'dat') this.datIntake(i, row, airfoil);
    });
    this.anchorsOnAirfoils();
    this.panelCorrection();
    this.shapingCuts();
    return this.diagnostics;
  }

  // The engine's datair finds the air inlet of a .dat airfoil where the
  // intrados crosses the inlet positions of section 2; without a crossing,
  // the point counts come from unset values.
  private datIntake(i: number, row: M.AirfoilRow, airfoil: LepAirfoil): void {
    const points = airfoil.points;
    const xini = row.intakeStart / 100;
    const xfin = row.intakeEnd / 100;
    let start = false;
    let end = false;
    for (let j = 0; j + 1 < points.length; j++) {
      const [u, v] = points[j];
      const [next] = points[j + 1];
      if (
        row.intakeStart >= 0
          ? u <= xini && next > xini && v <= 0
          : u >= xini && next < xini && v > 0
      )
        start = true;
      if (u <= xfin && next > xfin && v <= 0) end = true;
    }
    if (!start)
      this.error(
        `airfoils[${i}].intakeStart`,
        `The air inlet start (${row.intakeStart} %) does not fall on the intrados of ${row.airfoil}: the engine cannot place it`,
      );
    if (!end)
      this.error(
        `airfoils[${i}].intakeEnd`,
        `The air inlet end (${row.intakeEnd} %) does not fall on the intrados of ${row.airfoil}: the engine cannot place it`,
      );
  }

  // The engine finds each anchor between intrados points (from np(i,2)),
  // at its % of the chord. Not found, the anchor stays at (0, 0), the
  // leading edge: right for 0 %, a misplaced anchor between 0 and the
  // start of the intrados.
  private anchorsOnAirfoils(): void {
    this.section = 3;
    this.design.anchors.forEach((row, i) => {
      const found = this.airfoil(i + 1);
      if (found?.airfoil.format !== 'txt') return;
      const intrados = found.airfoil.points.slice(found.airfoil.extrados - 1).map(([u]) => u * 100);
      const min = Math.min(...intrados);
      const max = Math.max(...intrados);
      row.positions.slice(0, Math.max(0, Math.min(row.count, 5))).forEach((position, k) => {
        if (position > 0 && position < min) {
          this.add(
            'warning',
            `anchors[${i}].positions[${k}]`,
            `Anchor ${'ABCDE'[k]} at ${position} % is before the intrados of ${found.name} (${min} %): the engine places it at the leading edge`,
          );
        } else if (position < 0 || position > max) {
          this.error(
            `anchors[${i}].positions[${k}]`,
            `Anchor ${'ABCDE'[k]} at ${position} % is not on the intrados of ${found.name} (${min} to ${max} %)`,
          );
        }
      });
    });
  }

  // Other than 1000, panelCorrection.points (ndif) counts back from the end
  // of the extrados, np(i,2): the engine reads points np(i,2)-ndif-1 to
  // np(i,2). Checked on the .txt airfoils (datair computes np(i,2) itself).
  private panelCorrection(): void {
    this.section = 5;
    const { points } = this.design.skinTension.panelCorrection;
    if (points === 1000 || points < 1) return;
    const worst = this.design.airfoils
      .map((_, i) => this.airfoil(i + 1))
      .filter((found) => found?.airfoil.format === 'txt')
      .sort((a, b) => extrados(a!.airfoil) - extrados(b!.airfoil))[0];
    if (worst && points > extrados(worst.airfoil) - 2) {
      this.error(
        'skinTension.panelCorrection.points',
        `At most the extrados points - 2: ${worst.name} has ${extrados(worst.airfoil)} extrados points, so at most ${extrados(worst.airfoil) - 2}, not ${points}`,
      );
    }
  }

  private shapingCuts(): void {
    this.section = 29;
    const shaping = this.design.shaping;
    if (shaping.mode === 0) return;
    shaping.groups.forEach((g, ng) => {
      const seen = new Set<string>();
      for (
        let rib = Math.max(g.firstRib, 1);
        rib <= Math.min(g.lastRib, this.design.airfoils.length);
        rib++
      ) {
        const found = this.airfoil(rib);
        if (!found || found.airfoil.format !== 'txt' || seen.has(found.name)) continue;
        seen.add(found.name);
        const { extrados: e, inlet, points } = found.airfoil;
        // Upper cuts on the extrados (points 1 to np(i,2)); lower cuts on the
        // intrados, after the intake: npi=ilow-(np(i,2)+np(i,3)-2) >= 1.
        const ranges = { upper: [1, e], lower: [e + inlet - 1, points.length] } as const;
        for (const side of ['upper', 'lower'] as const) {
          const [min, max] = ranges[side];
          g[side].cuts.forEach((cut, c) => {
            for (const key of ['start', 'end'] as const) {
              if (cut[key] < min || cut[key] > max) {
                this.error(
                  `shaping.groups[${ng}].${side}.cuts[${c}].${key}`,
                  `Rib ${rib} (${found.name}): the ${side} points are ${min} to ${max}, not ${cut[key]}`,
                );
              }
            }
          });
        }
      }
    });
  }
}

const extrados = (airfoil: LepAirfoil) => (airfoil.format === 'txt' ? airfoil.extrados : 0);

/**
 * The anchors an H/V rib of types 1 to 5 (11 to 15 in %) uses: the column
 * of its rib, the anchor row (the next column) and the ribs the engine
 * reads it on (16.1 to 16.4 of the program). Type 1 joins two anchors;
 * types 2, 3 and 5 span the ribs around theirs, type 4 one more.
 */
function hvAnchors(r: M.HvRib): { column: number; ribs: number[]; row: number }[] {
  const [rib, row, rib2, row2] = r.parameters;
  const base = r.type > 10 ? r.type - 10 : r.type;
  if (base < 1 || base > 5 || rib === undefined || row === undefined) return [];
  const around = (last: number) =>
    Array.from({ length: last + 2 }, (_, k) => Math.trunc(rib) - 1 + k);
  if (base === 1) {
    return [
      { column: 0, ribs: [Math.trunc(rib)], row },
      ...(rib2 === undefined || row2 === undefined
        ? []
        : [{ column: 2, ribs: [Math.trunc(rib2)], row: row2 }]),
    ];
  }
  return [{ column: 0, ribs: around(base === 4 ? 2 : 1), row }];
}

/**
 * The number of lines the engine finds in plans of paths (sections 12.2
 * and 14.2 of the program): level by level, a line ends where the
 * (level, order) pair changes between two consecutive paths of a plan.
 * For the line plans, a, b, aa and bb keep their values over paths of more
 * than 4 levels, as in the engine.
 */
export function countLines(
  plans: readonly (readonly { levels: number; branches: readonly M.Branch[] }[])[],
  lines: boolean,
): number {
  let count = 0;
  let [a, b, aa, bb] = [0, 0, 0, 0];
  const pair = (path: { branches: readonly M.Branch[] }, k: number) => path.branches[k] ?? [0, 0];
  for (const paths of plans) {
    const last = paths.length - 2;
    for (let k = 0; k < 4; k++) {
      for (let j = 0; j <= last; j++) {
        const path = paths[j];
        const next = paths[j + 1];
        if (!lines || path.levels <= 4) [[a, b], [aa, bb]] = [pair(path, k), pair(next, k)];
        if (a === 0 || b === 0) continue;
        if (a === aa && b === bb && j === last) count++;
        if (a !== aa || b !== bb) count++;
        if (j === last) {
          [[a, b], [aa, bb]] = [pair(path, k), pair(next, k)];
          if ((a !== aa || b !== bb) && aa !== 0 && bb !== 0) count++;
        }
      }
    }
  }
  return count;
}
