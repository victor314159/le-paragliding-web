// Writes leparagliding.txt in a canonical layout: the records the engine
// reads (read-design.ts), standard comments in the records it skips and
// standard labels where it reads one. Comments and layout of a parsed file
// are not kept.
import type * as M from './model.ts';
import { EQUILIBRIUM, HVR_HOLE_KEYS, SEPARATION } from './read-design.ts';
import { failure, type Result } from './result.ts';
import { validateDesign } from './validate.ts';
import {
  formatInteger as int,
  formatReal as real,
  formatString as str,
  RULE,
  TextBuilder,
} from './writer.ts';

/** Writes a design as the text of `leparagliding.txt`, if it has no error. */
export function writeLep(design: M.LepDesign): Result<string> {
  const diagnostics = validateDesign(design);
  const errors = diagnostics.filter((d) => d.severity === 'error');
  if (errors.length) return failure(errors);
  return { ok: true, value: designText(design), warnings: diagnostics };
}

const reals = (values: readonly number[]) => values.map(real);
const ints = (values: readonly number[]) => values.map(int);

// The labels of section 19, which the manual asks not to change.
const LAYERS = [
  'general',
  'line-external',
  'line-sewing',
  'points',
  'circles',
  'triangles',
  'square',
  'text',
  'reference',
  'notes',
];
const MARK_TYPES = [
  'typepoint',
  'typepoint2',
  'typepoint3',
  'typevent',
  'typetab',
  'typejonc',
  'typeref',
  'type8',
  'type9',
  'type10',
];
const LINE_COLORS = ['A', 'B', 'C', 'D', 'E', 'F'].map((row) => `${row}_lines_color`);
const PRINT_3D = [
  ['interpolation', 'Inter3D'],
  ['ovalization', 'Ovali3D'],
  ['tessellation', 'tesse3D'],
  ['dxf', 'exteDXF'],
  ['stl', 'exteSTL'],
] as const;
const SEPARATION_LABELS = [
  'panel_x',
  'panel_x_min',
  'panel_y',
  'rib_x',
  'rib_y',
  'rib_1y',
  'jonc_x',
  'jonc_y',
  'jonc_i',
  'parameter10',
];
const EQUILIBRIUM_LABELS = [
  'g',
  'ro',
  'mu',
  'V',
  'Alpha',
  'Cl',
  'Cle',
  'Cd',
  'cde',
  'Cm',
  'Spilot',
  'Cdpilot',
  'Mw',
  'Mp',
  'Pmc',
  'Mql',
  'Ycp',
  'Zcp',
];

const skinPoint = (p: M.SkinTensionPoint) =>
  reals([p.extradosPosition, p.extradosOverwidth, p.intradosPosition, p.intradosOverwidth]);
const curve = (c: M.RodCurve) => reals([c.from, c.to, c.deflection, c.exponent]);
const pocket = (p: M.RodPocket) => reals([p.offset, p.outerWidth, p.rodWidth, p.innerWidth]);

export function designText(d: M.LepDesign): string {
  const t = new TextBuilder();
  geometry(t, d.geometry);

  t.section(
    2,
    'AIRFOILS',
    '* Rib  airfoil  inlet-start  inlet-end  open  displacement  weight  minirib',
  );
  t.table(
    d.airfoils.map((a) => [
      real(a.number),
      str(a.airfoil),
      ...reals([a.intakeStart, a.intakeEnd, a.open, a.displacement, a.relativeWeight, a.minirib]),
    ]),
  );

  t.section(3, 'ANCHOR POINTS', '* Rib  anchors  A  B  C  D  E  F');
  t.table(d.anchors.map((a) => reals([a.number, a.count, ...a.positions])));

  t.section(4, 'AIRFOIL HOLES');
  t.record(int(d.holes.length));
  for (const group of d.holes) {
    t.record(int(group.firstRib)).record(int(group.lastRib)).record(int(group.holes.length));
    t.table(group.holes.map((h) => reals([h.type, ...h.parameters])));
  }

  const skin = d.skinTension;
  t.section(5, 'SKIN TENSION', '* Extrados %  overwidth  intrados %  overwidth');
  t.table(skin.points.map(skinPoint));
  t.record(real(skin.miniribStrain));
  t.record(int(skin.panelCorrection.points), real(skin.panelCorrection.factor));

  const sewing = d.sewingAllowances;
  const panel = (p: M.PanelAllowances) => reals([p.sides, p.leadingEdge, p.trailingEdge]);
  t.section(6, 'SEWING ALLOWANCES (mm): upper panels, lower panels, ribs, V-ribs');
  t.record(...panel(sewing.upper)).record(...panel(sewing.lower));
  t.record(real(sewing.ribs)).record(real(sewing.vRibs));

  t.section(7, 'MARKS');
  t.record(...reals([d.marks.spacing, d.marks.pointRadius, d.marks.pointOffset]));

  const aoa = d.angleOfAttack;
  t.section(8, 'GLOBAL ANGLE OF ATTACK ESTIMATION', '* Finesse GR');
  t.record(real(aoa.glideRatio));
  t.comment('* Center of pressure % of chord').record(real(aoa.centerOfPressure));
  t.comment('* Calage %').record(real(aoa.calage));
  t.comment('* Risers length cm').record(real(aoa.risersLength));
  t.comment('* Lines length cm').record(real(aoa.linesLength));
  t.comment('* Karabiners cm').record(real(aoa.karabinerSeparation));

  lines(t, d.lines);
  brakes(t, d.brakes);

  const r = d.ramifications;
  t.section(11, 'RAMIFICATION LENGTHS');
  t.table([
    reals([r.lines3.level, r.lines3.l2]),
    reals([r.lines4.level, r.lines4.l3, r.lines4.l2]),
    reals([r.brakes3.level, r.brakes3.l2]),
    reals([r.brakes4.level, r.brakes4.l3, r.brakes4.l2]),
  ]);

  t.section(12, 'H V AND VH RIBS');
  t.record(int(d.hvRibs.ribs.length));
  t.record(real(d.hvRibs.separationX), real(d.hvRibs.separationY));
  t.table(d.hvRibs.ribs.map((h) => reals([h.number, h.type, ...h.parameters])));

  colors(t, 15, 'EXTRADOS COLORS', d.extradosColors);
  colors(t, 16, 'INTRADOS COLORS', d.intradosColors);

  t.section(17, 'ADDITIONAL RIB POINTS');
  t.record(int(d.ribPoints.length));
  t.table(d.ribPoints.map(reals));

  const e = d.elasticLines;
  t.section(18, 'ELASTIC LINES CORRECTIONS');
  t.record(real(e.flightLoad));
  t.table(e.distribution.map(reals));
  t.table(e.deformation.map((l) => reals([l.lines, l.lower, l.medium, l.higher])));

  t.section(19, 'DXF LAYER NAMES');
  t.record(int(d.dxfLayers.length));
  t.table(d.dxfLayers.map((name, i) => [LAYERS[i] ?? `layer${i + 1}`, str(name)]));

  t.section(20, 'MARKS TYPES');
  t.record(int(d.markTypes.length));
  t.table(
    d.markTypes.map((m, i) => [
      MARK_TYPES[i] ?? `type${i + 1}`,
      int(m.print.type),
      ...reals([m.print.size, m.print.offset]),
      int(m.laser.type),
      ...reals([m.laser.size, m.laser.offset]),
    ]),
  );

  joncs(t, d.joncs);

  t.section(22, 'NOSE MYLARS');
  t.record(int(d.noseMylars.mode));
  if (d.noseMylars.mode === 1) {
    t.record(int(d.noseMylars.groups.length));
    for (const g of d.noseMylars.groups) {
      t.record(...ints([g.group, g.firstRib, g.lastRib])).record(...reals(g.values));
    }
  }

  t.section(23, 'TAB REINFORCEMENTS');
  t.record(int(d.tabReinforcements.mode));

  t.section(24, 'GENERAL 2D DXF OPTIONS');
  t.record(int(d.dxf2d.mode));
  if (d.dxf2d.mode === 1) t.table(d.dxf2d.lineColors.map((c, k) => [LINE_COLORS[k], int(c)]));

  t.section(25, 'GENERAL 3D DXF OPTIONS');
  t.record(int(d.dxf3d.mode));
  if (d.dxf3d.mode === 1) {
    t.table([
      ...d.dxf3d.lineColors.map((c, k) => [LINE_COLORS[k], int(c)]),
      ...d.dxf3d.surfaces.map((s, k) => [
        ['Extrados', 'Vents', 'Intrados'][k],
        int(s.drawn),
        int(s.color),
      ]),
    ]);
  }

  t.section(26, 'GLUE VENTS');
  t.record(int(d.glueVents.mode));
  if (d.glueVents.mode === 1) {
    t.table(d.glueVents.ribs.map((v, i) => [int(i + 1), ...reals([v.type, ...v.parameters])]));
  }

  wingTip(t, d.wingTip);

  const c = d.calageVariation;
  t.section(28, 'PARAMETERS FOR CALAGE VARIATION');
  t.record(int(c.mode));
  if (c.mode === 1) {
    t.record(int(c.risers)).record(...reals(c.positions));
    t.record(real(c.speedAngle), int(c.speedSteps), real(c.trimAngle), int(c.trimSteps));
  }

  shaping(t, d.shaping);

  t.section(30, 'AIRFOIL THICKNESS MODIFICATION');
  t.record(int(d.thickness.mode));
  if (d.thickness.mode === 1) t.table(d.thickness.ribs.map((v, i) => [int(i + 1), real(v)]));

  const s = d.skinTensionGroups;
  t.section(31, 'NEW SKIN TENSION MODULE');
  t.record(int(s.mode));
  if (s.mode === 1) {
    t.record(int(s.groups.length));
    for (const g of s.groups) {
      t.comment(`* Group ${g.group}: ribs ${g.firstRib} to ${g.lastRib}, points, type`);
      t.record(...ints([g.group, g.firstRib, g.lastRib, g.points.length, g.type]));
      t.table(g.points.map((p, k) => [int(k + 1), ...skinPoint(p)]));
    }
  }

  const p = d.partsSeparation;
  t.section(32, 'PARAMETERS FOR PARTS SEPARATION');
  t.record(int(p.mode));
  if (p.mode === 1) t.table(SEPARATION.map(([key], k) => [SEPARATION_LABELS[k], real(p[key])]));

  const risers = d.risers;
  t.section(33, 'DETAILED RISERS');
  t.record(int(risers.mode));
  if (risers.mode === 1) {
    t.record(int(risers.type));
    if (risers.type === 1) {
      t.table(risers.lengths.map((v, i) => [String.fromCharCode(65 + i), real(v)]));
    }
  }

  lineTypes(t, d.lineTypes);

  const q = d.equilibrium;
  t.section(35, 'SOLVE EQUILIBRIUM EQUATIONS');
  t.record(int(q.mode));
  if (q.mode === 1) t.table(EQUILIBRIUM.map(([key], k) => [EQUILIBRIUM_LABELS[k], real(q[key])]));

  const x = d.xflr5;
  t.section(36, 'CREATE FILES FOR XFLR5 ANALYSIS');
  t.record(int(x.mode));
  if (x.mode === 1) {
    t.record('panels');
    const { chord, span, chordDistribution, spanDistribution } = x.panels;
    for (const n of [chord, span, chordDistribution, spanDistribution]) t.record(int(n));
    t.record('billowed').record(int(x.billowed));
  }

  const sp = d.specialParameters;
  t.section(37, 'SOME SPECIAL PARAMETERS');
  t.record(int(sp.mode));
  if (sp.mode === 1) {
    t.record(int(sp.entries.length));
    t.table(
      sp.entries.map((entry) => {
        if (entry.code === 3001) {
          return [int(entry.code), int(entry.transition), ...reals(entry.values)];
        }
        if (entry.code === 2000) return [int(entry.code), str(entry.value)];
        const value = entry.code === 1146 || entry.code === 2003 ? real : int;
        return [int(entry.code), value(entry.value)];
      }),
    );
  }

  t.section(38, 'HVR HOLES');
  t.record(int(d.hvrHoles.mode));
  if (d.hvrHoles.mode === 1) {
    t.record(int(d.hvrHoles.rows.length));
    t.table(d.hvrHoles.rows.map((row) => reals(HVR_HOLE_KEYS.map((key) => row[key]))));
  }

  t.section(39, 'HVR POSITION PARAMETERS');
  t.record(int(d.hvrPositions.mode));
  if (d.hvrPositions.coefficients) {
    t.record(int(d.hvrPositions.coefficients.length));
    t.table(
      d.hvrPositions.coefficients.map((f, k) => [
        `vrib_type${k + 1}`,
        ...reals([f.horizontal, f.vertical]),
      ]),
    );
  }
  return t.text();
}

function geometry(t: TextBuilder, g: M.Geometry): void {
  t.comment(RULE)
    .comment("* LABORATORI D'ENVOL PARAGLIDING DESIGN")
    .comment('* Input data file version 3.29')
    .comment(RULE)
    .comment('* Written by @lepara/format')
    .comment(RULE)
    .comment('*       1. GEOMETRY')
    .comment(RULE)
    .comment('* Brand name');
  t.record(str(g.brandName));
  t.comment('* Wing name').record(str(g.wingName));
  t.comment('* Drawing scale').record(real(g.drawingScale));
  t.comment('* Wing scale').record(real(g.wingScale));
  t.comment('* Number of cells').record(int(g.cells));
  t.comment('* Number of ribs').record(int(g.ribCount));
  t.comment('* Alpha max, washin mode (alpha center)');
  const w = g.washin;
  t.record(real(w.maxAngle), int(w.mode), ...(w.mode === 2 ? [real(w.centerAngle)] : []));
  t.comment('* Paraglider type and parameter');
  t.record(str(g.paragliderType), int(g.paragliderParameter));
  t.comment('* Rib geometric parameters');
  t.comment(
    `* Rib  x-rib  y-LE  y-TE  xp  z  beta  RP  Washin${g.ribColumns === 11 ? '  z_rot  z_pos' : ''}`,
  );
  t.table(
    g.ribs.map((r) =>
      reals([
        r.number,
        r.x,
        r.yLE,
        r.yTE,
        r.xp,
        r.z,
        r.beta,
        r.rotationPoint,
        r.washin,
        // validate requires both with 11 columns.
        ...(g.ribColumns === 11 ? [r.rotZ ?? 0, r.rotZPosition ?? 0] : []),
      ]),
    ),
  );
}

// A typed row: the values, a label the engine skips, then the line types.
const typed = (lineTypes: readonly number[] | undefined) =>
  lineTypes ? ['-', ...ints(lineTypes)] : [];

function lines(t: TextBuilder, l: M.Lines): void {
  t.section(9, 'SUSPENSION LINES DESCRIPTION');
  t.record(real(l.weighting)).record(int(l.plans.length));
  for (const plan of l.plans) {
    t.record(int(plan.paths.length));
    t.table(
      plan.paths.map((path) => [
        int(path.levels),
        ...ints(path.branches.flat()),
        int(path.anchorRow),
        int(path.anchorRib),
        ...typed(l.typed ? path.lineTypes : undefined),
      ]),
    );
  }
}

function brakes(t: TextBuilder, b: M.Brakes): void {
  t.section(10, 'BRAKES');
  t.record(real(b.length)).record(int(b.paths.length));
  t.table(
    b.paths.map((path) => [
      int(path.levels),
      ...ints(path.branches.flat()),
      int(path.anchorRow),
      real(path.anchorRib),
      ...typed(b.typed ? path.lineTypes : undefined),
    ]),
  );
  t.comment('* Brake distribution');
  t.record(...reals(b.distributionSpans)).record(...reals(b.distributionIncrements));
}

function colors(t: TextBuilder, n: number, title: string, c: M.Colors): void {
  t.section(n, title);
  if (c.mode === 'ribs') {
    t.record(int(c.ribs.length));
    for (const rib of c.ribs) {
      t.record(int(rib.rib), int(rib.marks.length));
      t.table(rib.marks.map((m) => [int(m.number), ...reals(m.positions)]));
    }
    return;
  }
  t.record('-2').record(int(c.panels.length));
  for (const panel of c.panels) {
    t.record(int(panel.panel), int(panel.cuts.length));
    t.table(
      panel.cuts.map((cut) => [
        int(cut.number),
        ...reals([cut.left, cut.right, cut.seamWidth, cut.unused]),
      ]),
    );
  }
}

function joncs(t: TextBuilder, j: M.Joncs): void {
  t.section(21, 'JONCS DEFINITION (NYLON RODS)');
  t.record(int(j.mode));
  const ribs = (g: M.RibGroup) => ints([g.group, g.firstRib, g.lastRib]);
  const nose = (groups: readonly M.NoseRodGroup[]) => {
    for (const g of groups) {
      t.record(...ribs(g)).table([curve(g.extrados), curve(g.intrados), pocket(g.pocket)]);
    }
  };
  if (j.mode === 1) {
    t.record(int(j.groups.length));
    nose(j.groups);
  }
  if (j.mode !== 2) return;
  t.record(int(j.blocs.length));
  for (const bloc of j.blocs) {
    t.record(int(bloc.number), int(bloc.type)).record(int(bloc.groups.length));
    if (bloc.type === 1) nose(bloc.groups);
    if (bloc.type === 2) {
      for (const g of bloc.groups) {
        t.record(...ribs(g)).table([
          reals([g.x1, g.y1, g.x2, g.y2, g.deflection]),
          pocket(g.pocket),
        ]);
      }
    }
    if (bloc.type === 3) {
      for (const g of bloc.groups) {
        t.record(...ribs(g)).table([
          curve(g.extrados),
          curve(g.upperRod),
          curve(g.lowerRod),
          curve(g.intrados),
          pocket(g.pocket),
        ]);
      }
    }
    if (bloc.type === 4 || bloc.type === 5) {
      for (const g of bloc.groups) {
        t.record(...ribs(g)).table([curve(g.initial), curve(g.final), pocket(g.pocket)]);
      }
    }
  }
}

function wingTip(t: TextBuilder, w: M.WingTip): void {
  t.section(27, 'SPECIAL WING TIP');
  t.record(int(w.mode));
  if (w.mode === 1) {
    t.table([
      ['angleLE', real(w.angleLE)],
      ['angleTE', real(w.angleTE)],
    ]);
  }
  if (w.mode === 2) {
    t.table([
      ['distance', real(w.distance)],
      ['angle', real(w.angle)],
    ]);
  }
  if (w.mode === 4) t.record('displacement', real(w.displacement), real(w.rotation));
}

function shaping(t: TextBuilder, s: M.Shaping): void {
  t.section(29, '3D SHAPING');
  t.record(int(s.mode));
  if (s.mode === 0) return;
  t.record(int(s.model)).record('groups', int(s.groups.length));
  for (const g of s.groups) {
    t.record('group', ...ints([g.group, g.firstRib, g.lastRib]));
    for (const side of ['upper', 'lower'] as const) {
      const surface = g[side];
      t.record(side, int(surface.cuts.length), int(surface.type));
      t.table(
        surface.cuts.map((cut) => [...ints([cut.number, cut.start, cut.end]), real(cut.depth)]),
      );
    }
  }
  t.comment('* Print parameters');
  t.table(
    PRINT_3D.map(([key, label]) => {
      const row = s.print[key];
      return [label, ...ints([row.draw, row.first, row.last, row.oneSide])];
    }),
  );
}

function lineTypes(t: TextBuilder, l: M.LineTypes): void {
  t.section(34, 'LINES CHARACTERISTICS TABLE');
  t.record(int(l.mode));
  if (l.mode === 0) return;
  t.record(int(l.types.length));
  t.table(
    l.types.map((type) => [
      int(type.number),
      type.kind,
      // An empty column keeps lines aligned with risers.
      ...(type.kind === 'r' ? reals([type.width, type.thickness]) : [real(type.diameter), '']),
      str(type.name),
      real(type.strength),
      'daN',
      str(type.material),
      real(type.weight),
      'g',
      str(type.loopType),
      real(type.loopLength),
      'cm',
      real(type.color),
    ]),
  );
}
