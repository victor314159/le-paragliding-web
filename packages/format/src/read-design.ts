// Reads leparagliding.txt as the engine does (build/fortran/leparagliding.f,
// section 4 "DATA READING"), statement by statement: the same records
// skipped, the same lists, the same BACKSPACEs. What the engine does not
// read is not in the model; a value or layout it cannot read consistently
// stops the reading with a diagnostic.
import { character, countWords, FortranReader, integer, real8, type Item } from './fortran.ts';
import type * as M from './model.ts';
import { attempt, FormatError, type Diagnostic, type Result } from './result.ts';

export const DESIGN_FILE = 'leparagliding.txt';

/** Reads the text of `leparagliding.txt`. */
export function parseLep(text: string, options: { file?: string } = {}): Result<M.LepDesign> {
  return attempt((warnings) => readDesign(text, options.file, warnings).design);
}

/** Where each field of a design is read from (1-based line and column). */
export interface FieldPosition {
  readonly line: number;
  readonly column: number;
}

/**
 * Reads `leparagliding.txt` and returns where each field comes from, by its
 * path in the model (`geometry.cells`, `lines.plans[0].paths[2].anchorRib`):
 * to place the diagnostics of `validate` in the text. A field read twice
 * keeps its last position.
 */
export function locateLep(
  text: string,
  options: { file?: string } = {},
): Result<ReadonlyMap<string, FieldPosition>> {
  return attempt((warnings) => readDesign(text, options.file, warnings).positions);
}

function readDesign(text: string, file = DESIGN_FILE, warnings: Diagnostic[]) {
  const reader = new FortranReader(text, file, warnings);
  return { design: new DesignReader(reader).design(), positions: reader.fieldPositions };
}

/** Ribs of the half wing: `nribss=int(ncells/2.)+1`. */
export const halfWingRibs = (cells: number) => Math.trunc(cells / 2) + 1;

const I = integer;
const R = real8;
// The words the engine reads into gname and never uses: a null value keeps
// whatever gname held, which does not matter.
const LABEL = (field: string) => character(50, 'gname', field, '');
// Row numbers read into scratch integers (j, i9, ksk, i), never used.
const SCRATCH = (name: string, field: string) => integer(name, field, 0);

/** A tuple of N T's. */
type TupleOf<T, N extends number, R extends T[] = []> = number extends N
  ? T[]
  : R['length'] extends N
    ? R
    : TupleOf<T, N, [...R, T]>;
type Numbers<T extends readonly unknown[]> = { -readonly [K in keyof T]: number };

/** Section 37 values the engine sets before reading the section. */
const SPECIAL_DEFAULTS: Readonly<Record<number, number>> = {
  1291: 12,
  1146: 36,
  1341: 0,
  1351: 1,
  1352: 2,
  1353: 0,
  3002: 60,
  2005: 0,
  2006: 0,
};

class DesignReader {
  private readonly r: FortranReader;

  constructor(r: FortranReader) {
    this.r = r;
  }

  // --- helpers ---------------------------------------------------------------

  private skip(n = 1): void {
    for (let i = 0; i < n; i++) this.r.skip();
  }

  private header(section: number, skipped = 3): void {
    this.r.section = section;
    this.skip(skipped);
  }

  /** Reads numbers only. */
  private nums<const T extends readonly Item[]>(items: T): Numbers<T> {
    return this.r.read(items) as Numbers<T>;
  }

  private num(item: Item): number {
    return this.r.read([item])[0] as number;
  }

  /** A labelled value: `label value`. */
  private labelled(item: Item): number {
    return this.r.read([LABEL(item.field ?? item.name), item])[1] as number;
  }

  /** Reals `name(1..n)` filling `field[0..n-1]`, or `field.key` for `keys`. */
  private reals<N extends number>(
    n: N,
    name: (k: number) => string,
    field: string,
    keys?: readonly string[],
  ): TupleOf<Item, N> {
    return Array.from({ length: n }, (_, k) =>
      R(name(k + 1), keys ? `${field}.${keys[k]}` : `${field}[${k}]`),
    ) as TupleOf<Item, N>;
  }

  /** An integer count: a negative one makes the engine skip a loop. */
  private count(item: Item): number {
    const n = this.num(item);
    if (n < 0) this.r.failAt(0, `${item.field ?? item.name} cannot be negative: ${n}`, item.field);
    return n;
  }

  /** An integer mode among `known`. */
  private mode<T extends number>(item: Item, known: readonly T[]): T {
    const n = this.num(item);
    if (!known.includes(n as T)) {
      this.r.failAt(
        0,
        `Unknown ${item.name} = ${n} (${item.field}): expected ${known.join(', ')}`,
        item.field,
      );
    }
    return n as T;
  }

  /** A value the engine reads twice (after BACKSPACE) must not change. */
  private same(index: number, first: unknown, second: unknown, field: string): void {
    if (first !== second) {
      this.r.failAt(
        index,
        `The engine reads ${field} twice, once as ${String(first)} and once as ${String(second)}: write each row on its own line`,
        field,
      );
    }
  }

  // A table's first row, read as '(A)' then backspaced: how many words?
  private columns(): number | undefined {
    const at = this.r.lineNumber;
    const line = this.r.line();
    this.r.backspace();
    if (line === undefined) return undefined;
    try {
      return countWords(line);
    } catch (error) {
      if (error instanceof FormatError) this.r.failHere(error.message, undefined, at);
      throw error;
    }
  }

  // --- the file ---------------------------------------------------------------

  design(): M.LepDesign {
    const geometry = this.geometry();
    const airfoils = this.airfoils(geometry.ribs);
    const anchors = this.anchors(airfoils);
    const holes = this.holes();
    const skinTension = this.skinTension();
    const sewingAllowances = this.sewingAllowances();
    const marks = this.marks();
    const angleOfAttack = this.angleOfAttack();
    const lines = this.lines();
    const brakes = this.brakes();
    const ramifications = this.ramifications();
    const hvRibs = this.hvRibs();
    const extradosColors = this.colors(15, 'extradosColors', 'e');
    const intradosColors = this.colors(16, 'intradosColors', 'i');
    const ribPoints = this.ribPoints();
    const elasticLines = this.elasticLines();
    const dxfLayers = this.dxfLayers();
    const markTypes = this.markTypes();
    const joncs = this.joncs();
    const noseMylars = this.noseMylars();
    const tabReinforcements = this.tabReinforcements();
    const dxf2d = this.dxf2d();
    const dxf3d = this.dxf3d();
    const glueVents = this.glueVents(geometry.ribs.length);
    const wingTip = this.wingTip();
    const calageVariation = this.calageVariation();
    const shaping = this.shaping();
    const thickness = this.thickness(geometry.ribs.length);
    const skinTensionGroups = this.skinTensionGroups();
    const partsSeparation = this.partsSeparation();
    const risers = this.risers(lines.plans.length);
    const lineTypes = this.lineTypes();
    const equilibrium = this.equilibrium();
    const xflr5 = this.xflr5();
    const specialParameters = this.specialParameters();
    const hvrHoles = this.hvrHoles();
    const hvrPositions = this.hvrPositions(hvrHoles.mode === 1);
    return {
      geometry,
      airfoils,
      anchors,
      holes,
      skinTension,
      sewingAllowances,
      marks,
      angleOfAttack,
      lines,
      brakes,
      ramifications,
      hvRibs,
      extradosColors,
      intradosColors,
      ribPoints,
      elasticLines,
      dxfLayers,
      markTypes,
      joncs,
      noseMylars,
      tabReinforcements,
      dxf2d,
      dxf3d,
      glueVents,
      wingTip,
      calageVariation,
      shaping,
      thickness,
      skinTensionGroups,
      partsSeparation,
      risers,
      lineTypes,
      equilibrium,
      xflr5,
      specialParameters,
      hvrHoles,
      hvrPositions,
    };
  }

  // --- 1. Geometry ------------------------------------------------------------

  private geometry(): M.Geometry {
    const f = 'geometry';
    this.header(1, 9);
    const [brandName] = this.r.read([character(50, 'bname', `${f}.brandName`)]) as [string];
    this.skip();
    const [wingName] = this.r.read([character(50, 'wname', `${f}.wingName`)]) as [string];
    this.skip();
    const drawingScale = this.num(R('xkf', `${f}.drawingScale`));
    this.skip();
    const wingScale = this.num(R('xwf', `${f}.wingScale`));
    this.skip();
    const cells = this.num(I('ncells', `${f}.cells`));
    this.skip();
    const ribCount = this.num(I('nribst', `${f}.ribCount`));
    this.skip();
    const washin = this.washin(`${f}.washin`);
    this.skip();
    const [paragliderType, paragliderParameter] = this.r.read([
      character(2, 'atp', `${f}.paragliderType`),
      I('kaaa', `${f}.paragliderParameter`),
    ]) as [string, number];
    this.skip(2);

    const n = halfWingRibs(cells);
    const words = this.columns();
    let ribColumns: 9 | 11 = 11;
    if (n >= 1) {
      if (words !== 9 && words !== 11) {
        this.r.failHere(
          `The rib table must have 9 or 11 columns: its first row has ${words ?? 0} words`,
          `${f}.ribColumns`,
        );
      }
      ribColumns = words;
    }
    const keys = ['number', 'x', 'yLE', 'yTE', 'xp', 'z', 'beta', 'rotationPoint', 'washin'];
    const columns = [1, 2, 3, 4, 6, 7, 9, 10, 51];
    if (ribColumns === 11) {
      keys.push('rotZ', 'rotZPosition');
      columns.push(250, 251);
    }
    const ribs: M.RibGeometry[] = [];
    for (let i = 0; i < n; i++) {
      const g = `${f}.ribs[${i}]`;
      const values = this.r.read(
        keys.map((key, k) => R(`rib(i,${columns[k]})`, `${g}.${key}`)),
      ) as number[];
      ribs.push(
        Object.fromEntries(keys.map((key, k) => [key, values[k]])) as unknown as M.RibGeometry,
      );
    }
    return {
      brandName,
      wingName,
      drawingScale,
      wingScale,
      cells,
      ribCount,
      washin,
      paragliderType,
      paragliderParameter,
      ribColumns,
      ribs,
    };
  }

  // `read alpham, kbbb`; with kbbb = 2, backspace and `read alpham, kbbb, alphac`.
  private washin(f: string): M.Washin {
    const [maxAngle, mode] = this.nums([R('alpham', `${f}.maxAngle`), I('kbbb', `${f}.mode`)]);
    if (mode === 0 || mode === 1) return { mode, maxAngle };
    if (mode !== 2) {
      this.r.failAt(1, `Unknown washin mode kbbb = ${mode}: expected 0, 1 or 2`, `${f}.mode`);
    }
    this.r.backspace();
    const [again, mode2, centerAngle] = this.nums([
      R('alpham', `${f}.maxAngle`, maxAngle),
      I('kbbb', `${f}.mode`, mode),
      R('alphac', `${f}.centerAngle`),
    ]);
    this.same(1, mode, mode2, `${f}.mode`);
    return { mode: 2, maxAngle: again, centerAngle };
  }

  // --- 2, 3 ----------------------------------------------------------------------

  // The rib numbers rib(i,1) of sections 1, 2 and 3 fill the same variable:
  // a null value keeps the previous section's.
  private airfoils(ribs: readonly M.RibGeometry[]): M.AirfoilRow[] {
    this.header(2, 4);
    return ribs.map((rib, i) => {
      const g = `airfoils[${i}]`;
      const [number, airfoil, intakeStart, intakeEnd, open, displacement, relativeWeight, minirib] =
        this.r.read([
          R('rib(i,1)', `${g}.number`, rib.number),
          character(50, 'nomair(i)', `${g}.airfoil`),
          R('rib(i,11)', `${g}.intakeStart`),
          R('rib(i,12)', `${g}.intakeEnd`),
          R('rib(i,14)', `${g}.open`),
          R('rib(i,50)', `${g}.displacement`),
          R('rib(i,55)', `${g}.relativeWeight`),
          R('rib(i,56)', `${g}.minirib`),
        ]) as [number, string, number, number, number, number, number, number];
      return {
        number,
        airfoil,
        intakeStart,
        intakeEnd,
        open,
        displacement,
        relativeWeight,
        minirib,
      };
    });
  }

  private anchors(airfoils: readonly M.AirfoilRow[]): M.AnchorRow[] {
    this.header(3, 4);
    return airfoils.map((airfoil, i) => {
      const g = `anchors[${i}]`;
      const [number, count, ...positions] = this.nums([
        R('rib(i,1)', `${g}.number`, airfoil.number),
        R('rib(i,15)', `${g}.count`),
        ...this.reals(6, (k) => `rib(i,${15 + k})`, `${g}.positions`),
      ]);
      return { number, count, positions };
    });
  }

  // --- 4. Holes ----------------------------------------------------------------------

  private holes(): M.HoleGroup[] {
    this.header(4);
    const groups: M.HoleGroup[] = [];
    const n = this.count(I('ndis', 'holes.length'));
    for (let m = 0; m < n; m++) {
      const g = `holes[${m}]`;
      const firstRib = this.num(I('nrib1', `${g}.firstRib`));
      const lastRib = this.num(I('nrib2', `${g}.lastRib`));
      const nhols = this.count(I('nhols', `${g}.holes.length`));
      const holes: M.Hole[] = [];
      for (let l = 0; l < nhols; l++) {
        const h = `${g}.holes[${l}]`;
        const [type, ...parameters] = this.nums([
          R('hol(ir,l,9)', `${h}.type`),
          ...this.reals(7, (k) => `hol(ir,l,${k + 1})`, `${h}.parameters`),
        ]);
        holes.push({ type, parameters });
      }
      groups.push({ firstRib, lastRib, holes });
    }
    return groups;
  }

  // --- 5 to 8 --------------------------------------------------------------------------

  private skinTension(): M.SkinTension {
    this.header(5, 4);
    const points = Array.from({ length: 6 }, (_, k) =>
      this.skinPoint((j) => `skin(${k + 1},${j})`, `skinTension.points[${k}]`),
    ) as unknown as M.SkinTension['points'];
    const miniribStrain = this.num(R('htens', 'skinTension.miniribStrain'));
    const [points2, factor] = this.nums([
      I('ndif', 'skinTension.panelCorrection.points'),
      R('xndif', 'skinTension.panelCorrection.factor'),
    ]);
    return { points, miniribStrain, panelCorrection: { points: points2, factor } };
  }

  private skinPoint(
    name: (k: number) => string,
    field: string,
    head: Item[] = [],
  ): M.SkinTensionPoint {
    const keys = ['extradosPosition', 'extradosOverwidth', 'intradosPosition', 'intradosOverwidth'];
    const values = this.r.read([...head, ...this.reals(4, name, field, keys)]).slice(head.length);
    return Object.fromEntries(
      keys.map((key, k) => [key, values[k]]),
    ) as unknown as M.SkinTensionPoint;
  }

  private sewingAllowances(): M.SewingAllowances {
    const f = 'sewingAllowances';
    this.header(6);
    const panel = (side: 'upp' | 'low', key: 'upper' | 'lower'): M.PanelAllowances => {
      const [sides, leadingEdge, trailingEdge] = this.nums([
        R(`x${side}`, `${f}.${key}.sides`),
        R(`x${side}le`, `${f}.${key}.leadingEdge`),
        R(`x${side}te`, `${f}.${key}.trailingEdge`),
      ]);
      return { sides, leadingEdge, trailingEdge };
    };
    const upper = panel('upp', 'upper');
    const lower = panel('low', 'lower');
    const ribs = this.num(R('xrib', `${f}.ribs`));
    const vRibs = this.num(R('xvrib', `${f}.vRibs`));
    return { upper, lower, ribs, vRibs };
  }

  private marks(): M.Marks {
    this.header(7);
    const [spacing, pointRadius, pointOffset] = this.nums([
      R('xmark', 'marks.spacing'),
      R('xcir', 'marks.pointRadius'),
      R('xdes', 'marks.pointOffset'),
    ]);
    return { spacing, pointRadius, pointOffset };
  }

  private angleOfAttack(): M.AngleOfAttack {
    const f = 'angleOfAttack';
    this.header(8, 4);
    const glideRatio = this.num(R('finesse', `${f}.glideRatio`));
    this.skip();
    const centerOfPressure = this.num(R('cpress', `${f}.centerOfPressure`));
    this.skip();
    const calage = this.num(R('calage', `${f}.calage`));
    this.skip();
    const risersLength = this.num(R('clengr', `${f}.risersLength`));
    this.skip();
    const linesLength = this.num(R('clengl', `${f}.linesLength`));
    this.skip();
    const karabinerSeparation = this.num(R('clengk', `${f}.karabinerSeparation`));
    return { glideRatio, centerOfPressure, calage, risersLength, linesLength, karabinerSeparation };
  }

  // --- 9. Lines -----------------------------------------------------------------------

  private lines(): M.Lines {
    this.header(9);
    const weighting = this.num(R('zcontrol', 'lines.weighting'));
    const slp = this.num(I('slp', 'lines.plans.length'));
    if (slp < 1) this.r.failAt(0, `At least one line plan is needed: slp = ${slp}`, 'lines.plans');
    // `read (22,*) i`, then the next record as '(A)', then two backspaces:
    // the words of the first path decide whether rows carry line types.
    const [paths1] = this.nums([I('i', 'lines.plans[0].paths.length')]);
    const words = this.columns();
    this.r.backspace();
    if (words === undefined || words < 11) {
      this.r.failHere(
        `The first path of section 9 must have 11 values, or more with line types: it has ${words ?? 0} words`,
        'lines.typed',
        this.r.lineNumber + 1,
      );
    }
    const typed = words > 11;
    const plans: M.LinePlan[] = [];
    for (let ii = 0; ii < slp; ii++) {
      const f = `lines.plans[${ii}]`;
      const cam = this.count(I('cam(ii)', `${f}.paths.length`));
      if (ii === 0) this.same(0, paths1, cam, `${f}.paths.length`);
      const paths: M.LinePath[] = [];
      for (let i = 0; i < cam; i++) paths.push(this.linePath(`${f}.paths[${i}]`, typed));
      plans.push({ paths });
    }
    return { weighting, typed, plans };
  }

  private linePath(f: string, typed: boolean): M.LinePath {
    const levels = this.num(I('mc(ii,i,1)', `${f}.levels`));
    this.r.backspace();
    // Untyped rows: up to 4 levels read 11 values, 5 levels 13. Typed rows: 2 to 4.
    if (typed ? ![2, 3, 4].includes(levels) : levels > 5) {
      this.r.failAt(
        0,
        `Unknown number of levels ${levels}: ${typed ? 'rows with line types have 2 to 4' : 'at most 5'}`,
        `${f}.levels`,
      );
    }
    const pairs = levels === 5 ? 5 : 4;
    const items: Item[] = [I('mc(ii,i,1)', `${f}.levels`, levels)];
    for (let k = 0; k < pairs; k++) {
      items.push(
        I(`mc(ii,i,${2 + 2 * k})`, `${f}.branches[${k}][0]`),
        I(`mc(ii,i,${3 + 2 * k})`, `${f}.branches[${k}][1]`),
      );
    }
    items.push(I('mc(ii,i,14)', `${f}.anchorRow`), I('mc(ii,i,15)', `${f}.anchorRib`));
    if (typed) {
      items.push(LABEL(`${f}.lineTypes`));
      for (let k = 0; k < levels; k++) items.push(I(`mc(ii,i,${31 + k})`, `${f}.lineTypes[${k}]`));
    }
    const values = this.r.read(items) as number[];
    this.same(0, levels, values[0], `${f}.levels`);
    const branches = Array.from({ length: pairs }, (_, k): M.Branch => [
      values[1 + 2 * k],
      values[2 + 2 * k],
    ]);
    const at = 1 + 2 * pairs;
    return {
      levels,
      branches,
      anchorRow: values[at],
      anchorRib: values[at + 1],
      ...(typed && { lineTypes: values.slice(at + 3) }),
    };
  }

  // --- 10. Brakes ---------------------------------------------------------------------

  private brakes(): M.Brakes {
    const f = 'brakes';
    this.header(10);
    const length = this.num(R('clengb', `${f}.length`));
    const cam = this.count(I('cam(slp+1)', `${f}.paths.length`));
    const words = this.columns();
    let typed = false;
    if (cam > 0) {
      if (words === undefined || words < 11) {
        this.r.failHere(
          `The first brake path must have 11 values, or more with line types: it has ${words ?? 0} words`,
          `${f}.typed`,
        );
      }
      typed = words > 11;
    }
    const paths: M.BrakePath[] = [];
    for (let i = 0; i < cam; i++) {
      const g = `${f}.paths[${i}]`;
      let levels: number | undefined;
      if (typed) {
        levels = this.num(I('mc(ii,i,1)', `${g}.levels`));
        this.r.backspace();
        if (![2, 3, 4].includes(levels)) {
          this.r.failAt(
            0,
            `Unknown number of levels ${levels}: rows with line types have 2 to 4`,
            `${g}.levels`,
          );
        }
      }
      const items: Item[] = [I('mc(ii,i,1)', `${g}.levels`, levels)];
      for (let k = 0; k < 4; k++) {
        items.push(
          I(`mc(ii,i,${2 + 2 * k})`, `${g}.branches[${k}][0]`),
          I(`mc(ii,i,${3 + 2 * k})`, `${g}.branches[${k}][1]`),
        );
      }
      items.push(I('mc(ii,i,14)', `${g}.anchorRow`), R('brake(i,3)', `${g}.anchorRib`));
      if (levels !== undefined) {
        items.push(LABEL(`${g}.lineTypes`));
        for (let k = 0; k < levels; k++)
          items.push(I(`mc(ii,i,${31 + k})`, `${g}.lineTypes[${k}]`));
      }
      const values = this.r.read(items) as number[];
      if (levels !== undefined) this.same(0, levels, values[0], `${g}.levels`);
      paths.push({
        levels: values[0],
        branches: [0, 1, 2, 3].map((k): M.Branch => [
          values[1 + 2 * k],
          values[2 + 2 * k],
        ]) as unknown as M.BrakePath['branches'],
        anchorRow: values[9],
        anchorRib: values[10],
        ...(levels !== undefined && { lineTypes: values.slice(12) }),
      });
    }
    this.skip();
    const distributionSpans = this.nums(
      this.reals(5, (k) => `bd(${k},1)`, `${f}.distributionSpans`),
    );
    const distributionIncrements = this.nums(
      this.reals(5, (k) => `bd(${k},2)`, `${f}.distributionIncrements`),
    );
    return { length, typed, paths, distributionSpans, distributionIncrements };
  }

  private ramifications(): M.Ramifications {
    const f = 'ramifications';
    this.header(11);
    const short = (k: number, key: string) => {
      const [level, l2] = this.nums([
        R(`raml(${k},1)`, `${f}.${key}.level`),
        R(`raml(${k},3)`, `${f}.${key}.l2`),
      ]);
      return { level, l2 };
    };
    const long = (k: number, key: string) => {
      const [level, l3, l2] = this.nums([
        R(`raml(${k},1)`, `${f}.${key}.level`),
        R(`raml(${k},3)`, `${f}.${key}.l3`),
        R(`raml(${k},4)`, `${f}.${key}.l2`),
      ]);
      return { level, l3, l2 };
    };
    return {
      lines3: short(3, 'lines3'),
      lines4: long(4, 'lines4'),
      brakes3: short(5, 'brakes3'),
      brakes4: long(6, 'brakes4'),
    };
  }

  // --- 12. H V and VH ribs -----------------------------------------------------------

  private hvRibs(): M.HvRibs {
    const f = 'hvRibs';
    this.header(12);
    const nhvr = this.count(I('nhvr', `${f}.ribs.length`));
    const [separationX, separationY] = this.nums([
      R('xrsep', `${f}.separationX`),
      R('yrsep', `${f}.separationY`),
    ]);
    const columns = (i: number, n: number, priors: readonly (number | undefined)[] = []) =>
      Array.from({ length: n }, (_, k) => {
        const field = k === 0 ? 'number' : k === 1 ? 'type' : `parameters[${k - 2}]`;
        return R(`hvr(i,${k + 1})`, `${f}.ribs[${i}].${field}`, priors[k]);
      });
    // First pass: 10 columns of every row.
    const first: number[][] = [];
    for (let i = 0; i < nhvr; i++) first.push(this.r.read(columns(i, 10)) as number[]);
    for (let i = 0; i < nhvr; i++) this.r.backspace();
    // Second pass: 12 columns for types 6 and 16, after the first pass's type.
    const ribs: M.HvRib[] = [];
    for (let i = 0; i < nhvr; i++) {
      const before = first[i];
      const type = before[1];
      // A null value keeps the first pass's value, except in columns 7 and
      // 8 of type 3 rows with column 9 = 1: the engine converts them between
      // the passes.
      const converted = type === 3 && before[8] === 1;
      const priors = before.map((v, k) => (converted && (k === 6 || k === 7) ? undefined : v));
      const values = this.r.read(
        columns(i, type === 6 || type === 16 ? 12 : 10, priors),
      ) as number[];
      before.forEach((v, k) => this.same(k, v, values[k], `${f}.ribs[${i}]`));
      ribs.push({ number: values[0], type: values[1], parameters: values.slice(2) });
    }
    return { separationX, separationY, ribs };
  }

  // --- 15, 16. Colors ---------------------------------------------------------------

  private colors(section: 15 | 16, f: string, s: 'e' | 'i'): M.Colors {
    this.header(section);
    const npc = this.num(I(`npc${s}`, `${f}.mode`));
    if (npc >= 0) {
      const ribs: M.ColorRib[] = [];
      for (let k = 0; k < npc; k++) {
        const g = `${f}.ribs[${k}]`;
        const [rib, n] = this.nums([
          I(`npc1${s}(k)`, `${g}.rib`),
          I(`npc2${s}(k)`, `${g}.marks.length`),
        ]);
        if (n < 0) this.r.failAt(1, `The number of marks cannot be negative: ${n}`, `${g}.marks`);
        const marks: M.ColorMark[] = [];
        for (let l = 0; l < n; l++) {
          const h = `${g}.marks[${l}]`;
          const [number, a, b] = this.nums([
            I(`npc3${s}(k,l)`, `${h}.number`),
            R(`xpc1${s}(k,l)`, `${h}.positions[0]`),
            R(`xpc2${s}(k,l)`, `${h}.positions[1]`),
          ]);
          marks.push({ number, positions: [a, b] });
        }
        ribs.push({ rib, marks });
      }
      return { mode: 'ribs', ribs };
    }
    if (npc !== -2) {
      this.r.failAt(
        0,
        `Unknown npc${s} = ${npc}: expected a number of ribs (0 or more) or -2`,
        `${f}.mode`,
      );
    }
    const n = this.count(I(`npac${s}`, `${f}.panels.length`));
    const panels: M.ColorPanel[] = [];
    for (let k = 0; k < n; k++) {
      const g = `${f}.panels[${k}]`;
      const [panel, m] = this.nums([
        I(`npac1${s}(k)`, `${g}.panel`),
        I(`npac2${s}(k)`, `${g}.cuts.length`),
      ]);
      if (m < 0) this.r.failAt(1, `The number of cuts cannot be negative: ${m}`, `${g}.cuts`);
      const cuts: M.ColorCut[] = [];
      for (let l = 0; l < m; l++) {
        const h = `${g}.cuts[${l}]`;
        const [number, left, right, seamWidth, unused] = this.nums([
          I(`npac3${s}(k,l)`, `${h}.number`),
          ...this.reals(4, (j) => `xpac${j}${s}(k,l)`, h, ['left', 'right', 'seamWidth', 'unused']),
        ]);
        cuts.push({ number, left, right, seamWidth, unused });
      }
      panels.push({ panel, cuts });
    }
    return { mode: 'panels', panels };
  }

  // --- 17 to 20 -------------------------------------------------------------------

  private ribPoints(): M.RibPoint[] {
    this.header(17);
    const n = this.count(I('narp', 'ribPoints.length'));
    return Array.from({ length: n }, (_, i) =>
      this.nums([R('xarp(i)', `ribPoints[${i}][0]`), R('yarp(i)', `ribPoints[${i}][1]`)]),
    );
  }

  private elasticLines(): M.ElasticLines {
    const f = 'elasticLines';
    this.header(18);
    const flightLoad = this.num(R('csusl', `${f}.flightLoad`));
    const distribution = [2, 3, 4, 5].map((n, d) =>
      this.r.read(this.reals(n, (k) => `cdis(${n},${k})`, `${f}.distribution[${d}]`)),
    ) as unknown as M.ElasticLines['distribution'];
    const deformation = Array.from({ length: 5 }, (_, i) => {
      const [lines, lower, medium, higher] = this.nums(
        this.reals(4, (k) => `csus(${i + 1},${k})`, `${f}.deformation[${i}]`, [
          'lines',
          'lower',
          'medium',
          'higher',
        ]),
      );
      return { lines, lower, medium, higher };
    }) as unknown as M.ElasticLines['deformation'];
    return { flightLoad, distribution, deformation };
  }

  private dxfLayers(): string[] {
    this.header(19);
    const n = this.count(I('k19d', 'dxfLayers.length'));
    return Array.from(
      { length: n },
      (_, i) =>
        this.r.read([
          LABEL(`dxfLayers[${i}]`),
          character(50, 'lyname(i)', `dxfLayers[${i}]`),
        ])[1] as string,
    );
  }

  private markTypes(): M.MarkType[] {
    this.header(20);
    const n = this.count(I('k20d', 'markTypes.length'));
    return Array.from({ length: n }, (_, i) => {
      const g = `markTypes[${i}]`;
      const [, ...v] = this.r.read([
        LABEL(g),
        I('typm1(i)', `${g}.print.type`),
        R('typm2(i)', `${g}.print.size`),
        R('typm3(i)', `${g}.print.offset`),
        I('typm4(i)', `${g}.laser.type`),
        R('typm5(i)', `${g}.laser.size`),
        R('typm6(i)', `${g}.laser.offset`),
      ]) as [string, number, number, number, number, number, number];
      return {
        print: { type: v[0], size: v[1], offset: v[2] },
        laser: { type: v[3], size: v[4], offset: v[5] },
      };
    });
  }

  // --- 21. Nylon rods ---------------------------------------------------------------

  private ribGroup(g: string, name: string): M.RibGroup {
    const [group, firstRib, lastRib] = this.nums([
      I(`${name}(ng,1)`, `${g}.group`),
      I(`${name}(ng,2)`, `${g}.firstRib`),
      I(`${name}(ng,3)`, `${g}.lastRib`),
    ]);
    return { group, firstRib, lastRib };
  }

  /** A rod curve `name(m,ng,first..first+3)`. */
  private curve(name: string, first: number, field: string): M.RodCurve {
    const [from, to, deflection, exponent] = this.nums(
      this.reals(4, (k) => `${name}(m,ng,${first + k - 1})`, field, [
        'from',
        'to',
        'deflection',
        'exponent',
      ]),
    );
    return { from, to, deflection, exponent };
  }

  private pocket(field: string): M.RodPocket {
    const [offset, outerWidth, rodWidth, innerWidth] = this.nums(
      this.reals(4, (k) => `sjoo(m,ng,${k})`, field, [
        'offset',
        'outerWidth',
        'rodWidth',
        'innerWidth',
      ]),
    );
    return { offset, outerWidth, rodWidth, innerWidth };
  }

  private noseRods(g: string): M.NoseRodGroup {
    return {
      ...this.ribGroup(g, 'ngoo'),
      extrados: this.curve('xextraa', 1, `${g}.extrados`),
      intrados: this.curve('xintraa', 1, `${g}.intrados`),
      pocket: this.pocket(`${g}.pocket`),
    };
  }

  private joncs(): M.Joncs {
    this.header(21);
    const mode = this.mode(I('k21d', 'joncs.mode'), [0, 1, 2] as const);
    if (mode === 0) return { mode };
    if (mode === 1) {
      const n = this.count(I('ng21', 'joncs.groups.length'));
      return {
        mode,
        groups: Array.from({ length: n }, (_, ng) => this.noseRods(`joncs.groups[${ng}]`)),
      };
    }
    const n = this.count(I('k21blocs', 'joncs.blocs.length'));
    const blocs: M.JoncBloc[] = [];
    for (let m = 0; m < n; m++) {
      const b = `joncs.blocs[${m}]`;
      const [number, type] = this.nums([
        I('k21blocf(m,1)', `${b}.number`),
        I('k21blocf(m,2)', `${b}.type`),
      ]);
      if (![1, 2, 3, 4, 5].includes(type)) {
        this.r.failAt(1, `Unknown rod type ${type}: expected 1 to 5`, `${b}.type`);
      }
      const count = this.count(I('k21blocf(m,3)', `${b}.groups.length`));
      const groups = <T>(read: (g: string) => T) =>
        Array.from({ length: count }, (_, ng) => read(`${b}.groups[${ng}]`));
      if (type === 1) {
        blocs.push({ number, type, groups: groups((g) => this.noseRods(g)) });
      } else if (type === 2) {
        blocs.push({
          number,
          type,
          groups: groups((g) => {
            const ribs = this.ribGroup(g, 'ngoo');
            const [x1, y1, x2, y2, deflection] = this.nums(
              this.reals(5, (k) => `x21(m,ng,${k})`, g, ['x1', 'y1', 'x2', 'y2', 'deflection']),
            );
            return { ...ribs, x1, y1, x2, y2, deflection, pocket: this.pocket(`${g}.pocket`) };
          }),
        });
      } else if (type === 3) {
        blocs.push({
          number,
          type,
          groups: groups((g) => ({
            ...this.ribGroup(g, 'ngoo'),
            extrados: this.curve('xextraa', 1, `${g}.extrados`),
            upperRod: this.curve('xextraa', 5, `${g}.upperRod`),
            lowerRod: this.curve('xintraa', 5, `${g}.lowerRod`),
            intrados: this.curve('xintraa', 1, `${g}.intrados`),
            pocket: this.pocket(`${g}.pocket`),
          })),
        });
      } else {
        blocs.push({
          number,
          type: type as 4 | 5,
          groups: groups((g) => ({
            ...this.ribGroup(g, 'ngoo'),
            initial: this.curve('xextraa', 1, `${g}.initial`),
            final: this.curve('xintraa', 1, `${g}.final`),
            pocket: this.pocket(`${g}.pocket`),
          })),
        });
      }
    }
    return { mode, blocs };
  }

  // --- 22 to 25 ------------------------------------------------------------------

  private noseMylars(): M.NoseMylars {
    this.header(22);
    const mode = this.mode(I('k22d', 'noseMylars.mode'), [0, 1] as const);
    if (mode === 0) return { mode };
    const n = this.count(I('ng22', 'noseMylars.groups.length'));
    return {
      mode,
      groups: Array.from({ length: n }, (_, ng) => {
        const g = `noseMylars.groups[${ng}]`;
        return {
          ...this.ribGroup(g, 'ngo'),
          values: this.nums(this.reals(6, (k) => `xmy(ng,${k})`, `${g}.values`)),
        };
      }),
    };
  }

  private tabReinforcements(): M.TabReinforcements {
    this.header(23);
    return { mode: this.num(I('k23d', 'tabReinforcements.mode')) };
  }

  private colorLines(first: number, field: string): number[] {
    return Array.from({ length: 6 }, (_, k) =>
      this.labelled(I(`iccolor(${first + k})`, `${field}[${k}]`)),
    );
  }

  private dxf2d(): M.Dxf2d {
    this.header(24);
    const mode = this.mode(I('k24d', 'dxf2d.mode'), [0, 1] as const);
    if (mode === 0) return { mode };
    return { mode, lineColors: this.colorLines(1, 'dxf2d.lineColors') as TupleOf<number, 6> };
  }

  private dxf3d(): M.Dxf3d {
    this.header(25);
    const mode = this.mode(I('k25d', 'dxf3d.mode'), [0, 1] as const);
    if (mode === 0) return { mode };
    const lineColors = this.colorLines(11, 'dxf3d.lineColors') as TupleOf<number, 6>;
    const surfaces = [11, 12, 13].map((k, s) => {
      const g = `dxf3d.surfaces[${s}]`;
      const [, drawn, color] = this.r.read([
        LABEL(g),
        I(`ele3d(${k})`, `${g}.drawn`),
        I(`ele3dc(${k})`, `${g}.color`),
      ]) as [string, number, number];
      return { drawn, color };
    }) as unknown as [M.Surface3d, M.Surface3d, M.Surface3d];
    return { mode, lineColors, surfaces };
  }

  // --- 26 to 28 ----------------------------------------------------------------

  private glueVents(ribs: number): M.GlueVents {
    this.header(26);
    const mode = this.mode(I('k26d', 'glueVents.mode'), [0, 1] as const);
    if (mode === 0) return { mode };
    const rows: M.GlueVent[] = [];
    for (let i = 0; i < ribs; i++) {
      const g = `glueVents.ribs[${i}]`;
      const [j, type] = this.nums([SCRATCH('j', g), R('rib(i,165)', `${g}.type`)]);
      const t = Math.abs(type);
      const extra = t === 4 || t === 6 ? 2 : t === 5 ? 3 : 0;
      if (!extra) {
        rows.push({ type, parameters: [] });
        continue;
      }
      this.r.backspace();
      const names = ['csi(i,19)', 'csi(i,20)', 'csi(i,18)'].slice(0, extra);
      const values = this.r.read([
        I('j', g, j),
        R('rib(i,165)', `${g}.type`, type),
        ...names.map((name, k) => R(name, `${g}.parameters[${k}]`)),
      ]) as number[];
      this.same(0, j, values[0], g);
      this.same(1, type, values[1], `${g}.type`);
      rows.push({ type, parameters: values.slice(2) });
    }
    return { mode, ribs: rows };
  }

  private wingTip(): M.WingTip {
    const f = 'wingTip';
    this.header(27);
    const mode = this.mode(I('k27d', `${f}.mode`), [0, 1, 2, 4] as const);
    switch (mode) {
      case 0:
        return { mode };
      case 1:
        return {
          mode,
          angleLE: this.labelled(R('alc1', `${f}.angleLE`)),
          angleTE: this.labelled(R('alc2', `${f}.angleTE`)),
        };
      case 2:
        return {
          mode,
          distance: this.labelled(R('sectx(27,3)', `${f}.distance`)),
          angle: this.labelled(R('sectx(27,4)', `${f}.angle`)),
        };
      case 4: {
        const [, displacement, rotation] = this.r.read([
          LABEL(`${f}.displacement`),
          R('sectx(27,10)', `${f}.displacement`),
          R('sectx(27,11)', `${f}.rotation`),
        ]) as [string, number, number];
        return { mode, displacement, rotation };
      }
    }
  }

  private calageVariation(): M.CalageVariation {
    const f = 'calageVariation';
    this.header(28);
    const mode = this.mode(I('k28d', `${f}.mode`), [0, 1] as const);
    if (mode === 0) return { mode };
    const risers = this.num(I('nriser28', `${f}.risers`));
    const positions = this.nums(this.reals(6, (k) => `p28(${k})`, `${f}.positions`));
    const [speedAngle, speedSteps, trimAngle, trimSteps] = this.nums([
      R('a128', `${f}.speedAngle`),
      I('n128', `${f}.speedSteps`),
      R('a228', `${f}.trimAngle`),
      I('n228', `${f}.trimSteps`),
    ]);
    return { mode, risers, positions, speedAngle, speedSteps, trimAngle, trimSteps };
  }

  // --- 29. 3D shaping -------------------------------------------------------------

  private shaping(): M.Shaping {
    const f = 'shaping';
    this.header(29);
    const mode = this.mode(I('k29d', `${f}.mode`), [0, 1, 2] as const);
    if (mode === 0) return { mode };
    const x = mode === 2 ? 'x' : '';
    const model = this.num(I('k29dd', `${f}.model`));
    const ng29 = this.labelled(I('ng29', `${f}.groups.length`));
    if (ng29 < 0)
      this.r.failAt(1, `The number of groups cannot be negative: ${ng29}`, `${f}.groups`);
    const groups: M.ShapingGroup[] = [];
    for (let ng = 0; ng < ng29; ng++) {
      const g = `${f}.groups[${ng}]`;
      const [, group, firstRib, lastRib] = this.r.read([
        LABEL(g),
        I('k', `${g}.group`),
        I('ini29(ng)', `${g}.firstRib`),
        I('fin29(ng)', `${g}.lastRib`),
      ]) as [string, number, number, number];
      const surface = (side: 'upper' | 'lower', name: 'upp' | 'low', maxCuts: number) => {
        const h = `${g}.${side}`;
        const [, cuts, type] = this.r.read([
          LABEL(h),
          I(`${name}cuts(ng)`, `${h}.cuts.length`),
          I(`${name}type(ng)`, `${h}.type`),
        ]) as [string, number, number];
        if (cuts < 0 || cuts > maxCuts) {
          this.r.failAt(1, `Unknown ${name}cuts = ${cuts}: expected 0 to ${maxCuts}`, `${h}.cuts`);
        }
        const rows = Array.from({ length: cuts }, (_, c) => {
          const [number, start, end, depth] = this.nums([
            I(`i${name}(${c + 1},1,ng)`, `${h}.cuts[${c}].number`),
            I(`${x}i${name}(${c + 1},2,ng)`, `${h}.cuts[${c}].start`),
            I(`${x}i${name}(${c + 1},3,ng)`, `${h}.cuts[${c}].end`),
            R(`ki${name}(${c + 1},ng)`, `${h}.cuts[${c}].depth`),
          ]);
          return { number, start, end, depth };
        });
        return { type, cuts: rows };
      };
      const upper = surface('upper', 'upp', 2);
      const lower = surface('lower', 'low', 1);
      groups.push({ group, firstRib, lastRib, upper, lower });
    }
    this.skip();
    const keys = ['interpolation', 'ovalization', 'tessellation', 'dxf', 'stl'] as const;
    const print = Object.fromEntries(
      keys.map((key, k) => {
        const g = `${f}.print.${key}`;
        const [, draw, first, last, oneSide] = this.r.read([
          LABEL(g),
          I(`pp29(${k + 1},1)`, `${g}.draw`),
          I(`pp29(${k + 1},2)`, `${g}.first`),
          I(`pp29(${k + 1},3)`, `${g}.last`),
          I(`pp29(${k + 1},4)`, `${g}.oneSide`),
        ]) as [string, number, number, number, number];
        return [key, { draw, first, last, oneSide }];
      }),
    ) as unknown as M.ShapingPrint;
    return { mode, model, groups, print };
  }

  // --- 30 to 33 -----------------------------------------------------------------

  private thickness(ribs: number): M.Thickness {
    this.header(30);
    const mode = this.mode(I('k30d', 'thickness.mode'), [0, 1] as const);
    if (mode === 0) return { mode };
    return {
      mode,
      ribs: Array.from(
        { length: ribs },
        (_, i) =>
          this.r.read([
            SCRATCH('i9', `thickness.ribs[${i}]`),
            R('rib(i,160)', `thickness.ribs[${i}]`),
          ])[1] as number,
      ),
    };
  }

  private skinTensionGroups(): M.SkinTensionGroups {
    const f = 'skinTensionGroups';
    this.header(31);
    const mode = this.mode(I('k31d', `${f}.mode`), [0, 1] as const);
    if (mode === 0) return { mode };
    const n = this.count(I('ngskt', `${f}.groups.length`));
    const groups: M.SkinTensionGroup[] = [];
    for (let ng = 0; ng < n; ng++) {
      const g = `${f}.groups[${ng}]`;
      this.skip();
      const [group, firstRib, lastRib, npoints, type] = this.nums([
        I('ngi', `${g}.group`),
        I('nribini', `${g}.firstRib`),
        I('nribfin', `${g}.lastRib`),
        I('npoints', `${g}.points.length`),
        I('ntype31', `${g}.type`),
      ]);
      if (npoints < 0) {
        this.r.failAt(3, `The number of points cannot be negative: ${npoints}`, `${g}.points`);
      }
      const points = Array.from({ length: npoints }, (_, k) =>
        this.skinPoint((j) => `skinew(k,${j})`, `${g}.points[${k}]`, [
          SCRATCH('ksk', `${g}.points[${k}]`),
        ]),
      );
      groups.push({ group, firstRib, lastRib, type, points });
    }
    return { mode, groups };
  }

  private partsSeparation(): M.PartsSeparation {
    const f = 'partsSeparation';
    this.header(32);
    const mode = this.mode(I('k32d', `${f}.mode`), [0, 1] as const);
    if (mode === 0) return { mode };
    const values = Object.fromEntries(
      SEPARATION.map(([key, name]) => [key, this.labelled(R(name, `${f}.${key}`))]),
    ) as Record<(typeof SEPARATION)[number][0], number>;
    return { mode, ...values };
  }

  private risers(plans: number): M.Risers {
    this.header(33);
    const mode = this.mode(I('k33d', 'risers.mode'), [0, 1] as const);
    if (mode === 0) return { mode };
    const type = this.mode(I('k33t', 'risers.type'), [1, 2, 3, 4] as const);
    if (type !== 1) return { mode, type };
    return {
      mode,
      type,
      lengths: Array.from({ length: plans }, (_, i) =>
        this.labelled(R('x33(i)', `risers.lengths[${i}]`)),
      ),
    };
  }

  // --- 34. Lines characteristics ---------------------------------------------

  private lineTypes(): M.LineTypes {
    this.header(34);
    const mode = this.mode(I('k34d', 'lineTypes.mode'), [0, 1] as const);
    if (mode === 0) return { mode };
    const n = this.count(I('k34n', 'lineTypes.types.length'));
    const types: M.LineType[] = [];
    for (let i = 0; i < n; i++) {
      const g = `lineTypes.types[${i}]`;
      const [number, kind] = this.r.read([
        I('jltype(i)', `${g}.number`),
        character(30, 'tylinea(i,1)', `${g}.kind`),
      ]) as [number, string];
      this.r.backspace();
      if (kind !== 'r' && kind !== 'c') {
        this.r.failAt(
          1,
          `Unknown line kind "${kind}": expected r (riser) or c (line)`,
          `${g}.kind`,
        );
      }
      const tyline = (k: number, key: string) => R(`tyline(i,${k})`, `${g}.${key}`);
      const tylinea = (k: number, key: string) => character(30, `tylinea(i,${k})`, `${g}.${key}`);
      const size =
        kind === 'r' ? [tyline(2, 'width'), tyline(3, 'thickness')] : [tyline(2, 'diameter')];
      const values = this.r.read([
        I('j', `${g}.number`, number),
        character(30, 'tylinea(i,1)', `${g}.kind`, kind),
        ...size,
        tylinea(4, 'name'),
        tyline(5, 'strength'),
        LABEL(`${g}.strength`),
        tylinea(6, 'material'),
        tyline(7, 'weight'),
        LABEL(`${g}.weight`),
        tylinea(8, 'loopType'),
        tyline(9, 'loopLength'),
        LABEL(`${g}.loopLength`),
        tyline(10, 'color'),
      ]);
      this.same(0, number, values[0], `${g}.number`);
      this.same(1, kind, values[1], `${g}.kind`);
      const rest = values.slice(2 + size.length) as [
        string,
        number,
        string,
        string,
        number,
        string,
        string,
        number,
        string,
        number,
      ];
      const common = {
        number,
        name: rest[0],
        strength: rest[1],
        material: rest[3],
        weight: rest[4],
        loopType: rest[6],
        loopLength: rest[7],
        color: rest[9],
      };
      types.push(
        kind === 'r'
          ? { ...common, kind, width: values[2] as number, thickness: values[3] as number }
          : { ...common, kind, diameter: values[2] as number },
      );
    }
    return { mode, types };
  }

  // --- 35 to 37 ------------------------------------------------------------------

  private equilibrium(): M.Equilibrium {
    const f = 'equilibrium';
    this.header(35);
    const mode = this.mode(I('k35d', `${f}.mode`), [0, 1] as const);
    if (mode === 0) return { mode };
    const values = Object.fromEntries(
      EQUILIBRIUM.map(([key, name]) => [key, this.labelled(R(name, `${f}.${key}`))]),
    ) as Record<(typeof EQUILIBRIUM)[number][0], number>;
    return { mode, ...values };
  }

  private xflr5(): M.Xflr5 {
    const f = 'xflr5';
    this.header(36);
    const mode = this.mode(I('k36d', `${f}.mode`), [0, 1] as const);
    if (mode === 0) return { mode };
    this.r.read([LABEL(`${f}.panels`)]);
    const [chord, span, chordDistribution, spanDistribution] = (
      [
        ['a', 'chord'],
        ['b', 'span'],
        ['c', 'chordDistribution'],
        ['d', 'spanDistribution'],
      ] as const
    ).map(([s, key]) => this.num(I(`k36_${s}`, `${f}.panels.${key}`)));
    this.r.read([LABEL(`${f}.billowed`)]);
    const billowed = this.num(I('k36_e', `${f}.billowed`));
    return {
      mode,
      panels: { chord, span, chordDistribution, spanDistribution },
      billowed,
    };
  }

  private specialParameters(): M.SpecialParameters {
    const f = 'specialParameters';
    this.header(37);
    const mode = this.mode(I('k37d', `${f}.mode`), [0, 1] as const);
    if (mode === 0) return { mode };
    const n = this.count(I('k37n', `${f}.entries.length`));
    // The variables' values: the engine's defaults, then each value read.
    const current = new Map<number, number | string>(
      Object.entries(SPECIAL_DEFAULTS).map(([k, v]) => [Number(k), v]),
    );
    let transition: number | undefined = 0; // i3001(2)=0 before the section
    const entries: M.SpecialParameter[] = [];
    for (let i = 0; i < n; i++) {
      const g = `${f}.entries[${i}]`;
      const code = this.num(I('icode', `${g}.code`));
      this.r.backspace();
      if (code === 3001) {
        const [first, mode3001]: [number, number] = this.nums([
          I('i3001(1)', `${g}.code`, code),
          I('i3001(2)', `${g}.transition`, transition),
        ]);
        this.same(0, code, first, `${g}.code`);
        this.r.backspace();
        if (mode3001 !== 1 && mode3001 !== 2 && mode3001 !== 3) {
          this.r.failAt(
            1,
            `Unknown minirib transition ${mode3001}: expected 1, 2 or 3 (the engine does not read the line otherwise)`,
            `${g}.transition`,
          );
        }
        const [code2, transition2, c3, c4] = this.nums([
          I('i3001(1)', `${g}.code`, code),
          I('i3001(2)', `${g}.transition`, mode3001),
          R('c3001(3)', `${g}.values[0]`),
          R('c3001(4)', `${g}.values[1]`),
        ]);
        this.same(0, code, code2, `${g}.code`);
        this.same(1, mode3001, transition2, `${g}.transition`);
        transition = mode3001;
        entries.push({ code, transition: mode3001, values: [c3, c4] });
        continue;
      }
      const variable = SPECIAL[code];
      if (!variable) {
        this.r.failAt(0, `Unknown special parameter code ${code}`, `${g}.code`);
      }
      const [type, name] = variable;
      const prior = current.get(code);
      const valueItem =
        type === 'integer'
          ? I(name, `${g}.value`, prior as number | undefined)
          : type === 'real8'
            ? R(name, `${g}.value`, prior as number | undefined)
            : character(30, name, `${g}.value`, prior as string | undefined);
      const [code2, value] = this.r.read([I('icode37(i)', `${g}.code`, code), valueItem]) as [
        number,
        number & string,
      ];
      this.same(0, code, code2, `${g}.code`);
      current.set(code, value);
      entries.push({ code, value } as M.SpecialParameter);
    }
    return { mode, entries };
  }

  // --- 38, 39 -----------------------------------------------------------------------

  private hvrHoles(): M.HvrHoles {
    this.header(38);
    const mode = this.mode(I('k38d', 'hvrHoles.mode'), [0, 1] as const);
    if (mode === 0) return { mode };
    const n = this.count(I('k38lines', 'hvrHoles.rows.length'));
    return {
      mode,
      rows: Array.from({ length: n }, (_, k) => {
        const values = this.r.read(
          this.reals(9, (j) => `x38data(k,${j})`, `hvrHoles.rows[${k}]`, HVR_HOLE_KEYS),
        ) as number[];
        return Object.fromEntries(
          HVR_HOLE_KEYS.map((key, j) => [key, values[j]]),
        ) as unknown as M.HvrHoleRow;
      }),
    };
  }

  private hvrPositions(read: boolean): M.HvrPositions {
    const f = 'hvrPositions';
    this.header(39);
    const mode = this.mode(I('k39d', `${f}.mode`), [0, 1] as const);
    if (!read) return { mode };
    this.num(SCRATCH('i', `${f}.coefficients`));
    // k39d = 0 sets the coefficients of types 1, 2, 3, 5 and 6 to 1 first.
    const prior = (k: number) => (mode === 0 && k !== 3 ? 1 : undefined);
    const coefficients = Array.from({ length: 6 }, (_, k) => {
      const g = `${f}.coefficients[${k}]`;
      const [horizontal, vertical] = this.r
        .read([
          LABEL(g),
          R(`vrib_${k + 1}_coe1`, `${g}.horizontal`, prior(k)),
          R(`vrib_${k + 1}_coe2`, `${g}.vertical`, prior(k)),
        ])
        .slice(1) as [number, number];
      return { horizontal, vertical };
    }) as unknown as NonNullable<M.HvrPositions['coefficients']>;
    return { mode, coefficients };
  }
}

/** Section 32, in file order: model key, Fortran variable. */
export const SEPARATION = [
  ['panelX', 'panel_x_coe'],
  ['panelXMin', 'panel_x_min'],
  ['panelY', 'panel_y_coe'],
  ['ribX', 'rib_x_coe'],
  ['ribY', 'rib_y_coe'],
  ['rib1Y', 'rib_1_coe'],
  ['joncX', 'jonc_x_coe'],
  ['joncY', 'jonc_y_coe'],
  ['joncI', 'jonc_i_coe'],
  ['parameter10', 'xgname'],
] as const;

/** Section 35, in file order: model key, Fortran variable. */
export const EQUILIBRIUM = [
  ['gravity', 'x35grav'],
  ['airDensity', 'x35ro'],
  ['viscosity', 'x35mu'],
  ['speed', 'x35v'],
  ['alpha', 'x35alpha'],
  ['cl', 'x35cl'],
  ['cle', 'x35cle'],
  ['cd', 'x35cd'],
  ['cde', 'x35cde'],
  ['cm', 'x35cm'],
  ['pilotSurface', 'x35spilot'],
  ['pilotDrag', 'x35dpcoef'],
  ['wingMass', 'x35wingmass'],
  ['pilotMass', 'x35pilotmass'],
  ['pilotMassCenter', 'x35pmc'],
  ['quickLinkMass', 'x35qlmass'],
  ['ycp', 'x35ycp'],
  ['zcp', 'x35zcp'],
] as const;

/** Section 38, the columns of a row. */
export const HVR_HOLE_KEYS = [
  'number',
  'type',
  'drawn',
  'holes',
  'height',
  'width',
  'center',
  'offset',
  'unused',
] as const;

/** Section 37, codes other than 3001: type and Fortran variable of the value. */
export const SPECIAL: Readonly<
  Record<number, readonly ['integer' | 'real8' | 'character', string]>
> = {
  1291: ['integer', 'nsegments'],
  1146: ['real8', 'chord_pcdg'],
  1341: ['integer', 'i37c'],
  1351: ['integer', 'i37solve'],
  1352: ['integer', 'i37fparea'],
  1353: ['integer', 'i37output'],
  2000: ['character', 'a37date'],
  2003: ['real8', 'assiette2003'],
  3002: ['integer', 'nelliref'],
  2005: ['integer', 'i37_2005'],
  2006: ['integer', 'i37_2006'],
};
