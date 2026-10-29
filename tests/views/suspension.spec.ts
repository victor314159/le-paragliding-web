import { expect, test } from '@playwright/test';
import { LINE_TYPES_DEFAULTS, type LepDesign } from '../../packages/format/src/index.ts';
import { brakeLines, suspensionLines } from '../../packages/geometry/src/index.ts';
import {
  linesModel,
  wingOverviewLayers,
  wingOverviewModel,
} from '../../packages/views/src/index.ts';
import { project } from '../format/helpers';

const fixture = project('oracle/designs/swoop2');
const untyped = (): LepDesign => ({
  ...fixture.design,
  lines: {
    ...fixture.design.lines,
    typed: false,
    plans: fixture.design.lines.plans.map((plan) => ({
      paths: plan.paths.map(({ levels, branches, anchorRow, anchorRib }) => ({
        levels,
        branches,
        anchorRow,
        anchorRib,
      })),
    })),
  },
  brakes: {
    ...fixture.design.brakes,
    typed: false,
    paths: fixture.design.brakes.paths.map(({ levels, branches, anchorRow, anchorRib }) => ({
      levels,
      branches,
      anchorRow,
      anchorRib,
    })),
  },
});
const physical = (design: LepDesign) =>
  linesModel(design, fixture.airfoils, undefined, undefined, {
    dots: false,
    types: design.lineTypes,
  });
const distance = (a: readonly number[], b: readonly number[]) =>
  Math.hypot(...a.map((v, i) => v - b[i]));

test('overview uses engine diameters and rectangular risers in cm, with no line dots', () => {
  const design = { ...untyped(), lineTypes: { mode: 0 as const } };
  const lines = suspensionLines(design, fixture.airfoils);
  const brakes = brakeLines(design, fixture.airfoils, lines);
  const model = physical(design);
  expect(model.dots).toEqual([]);
  const solids = model.surfaces.filter((surface) => surface.kind === 'line');
  expect(solids).toHaveLength(2 * (lines.length + brakes.length));
  // Right half follows its mirrored solid; defaults are 25 x 2 mm for a riser.
  const riser = solids[1].rows[0];
  expect(riser).toHaveLength(5);
  expect(distance(riser[0], riser[1])).toBeCloseTo(2.5, 10);
  expect(distance(riser[1], riser[2])).toBeCloseTo(0.2, 10);
  const index = lines.findIndex((line) => line.level === 2);
  const ring = solids[2 * index + 1].rows[0];
  expect(ring).toHaveLength(13);
  for (const point of ring) expect(distance(point, lines[index].start)).toBeCloseTo(1.9 / 20, 10);
  const mainBrake = solids[2 * lines.length + 1].rows[0];
  for (const point of mainBrake) expect(distance(point, brakes[0].start)).toBeCloseTo(2 / 20, 10);
  // Section previews keep their dots and schematic centerlines.
  const section = linesModel(design, fixture.airfoils);
  expect(section.dots.length).toBeGreaterThan(0);
  expect(section.lines.filter((line) => line.kind === 'line')).toHaveLength(solids.length);
});

test('explicit per-level types use custom diameters without scaling them with wing geometry', () => {
  const base = untyped();
  const input: LepDesign = {
    ...base,
    geometry: { ...base.geometry, wingScale: base.geometry.wingScale * 2 },
    lines: {
      ...base.lines,
      typed: true,
      plans: base.lines.plans.map((plan) => ({
        paths: plan.paths.map((path) => ({
          ...path,
          lineTypes: Array.from({ length: path.levels }, () => 2),
        })),
      })),
    },
    brakes: {
      ...base.brakes,
      typed: true,
      paths: base.brakes.paths.map((path) => ({
        ...path,
        lineTypes: Array.from({ length: path.levels }, () => 2),
      })),
    },
    lineTypes: {
      mode: 1,
      types: LINE_TYPES_DEFAULTS.types.map((type) =>
        type.number === 2 ? { ...type, kind: 'c', diameter: 3.2 } : type,
      ),
    },
  };
  const lines = suspensionLines(input, fixture.airfoils);
  const brakes = brakeLines(input, fixture.airfoils, lines);
  const solids = physical(input).surfaces.filter((surface) => surface.kind === 'line');
  for (const [i, line] of [...lines, ...brakes].entries()) {
    const right = solids[2 * i + 1];
    expect(right.rows[0]).toHaveLength(13);
    for (const [r, center] of [line.start, line.end].entries())
      for (const point of right.rows[r]) expect(distance(point, center)).toBeCloseTo(3.2 / 20, 10);
  }
});

test('unknown or invalid cross sections remain schematic instead of inventing sizes', () => {
  const base = untyped();
  for (const types of [
    [],
    LINE_TYPES_DEFAULTS.types.map((type) =>
      type.kind === 'c' ? { ...type, diameter: NaN } : { ...type, width: -1 },
    ),
  ]) {
    const model = physical({ ...base, lineTypes: { mode: 1, types } });
    expect(model.surfaces.filter((surface) => surface.kind === 'line')).toEqual([]);
    expect(model.lines.filter((line) => line.kind === 'line').length).toBeGreaterThan(0);
    expect(model.dots).toEqual([]);
  }
});

test('overview triples cross sections around unchanged line endpoints and labels the exaggeration', () => {
  const design = { ...untyped(), lineTypes: { mode: 0 as const } };
  const actual = physical(design).surfaces.filter((s) => s.kind === 'line');
  const layers = wingOverviewLayers(design, fixture.airfoils);
  const enlarged = layers.lines.surfaces;
  expect(enlarged).toHaveLength(actual.length);
  for (let i = 0; i < actual.length; i++)
    for (let r = 0; r < 2; r++) {
      const ring = actual[i].rows[r].slice(0, -1);
      const center = [0, 1, 2].map(
        (axis) => ring.reduce((sum, p) => sum + p[axis], 0) / ring.length,
      );
      actual[i].rows[r].forEach((point, k) =>
        point.forEach((value, axis) => {
          expect(enlarged[i].rows[r][k][axis] - center[axis]).toBeCloseTo(
            3 * (value - center[axis]),
            10,
          );
        }),
      );
    }
  expect(wingOverviewModel(layers, new Set(['lines'])).note).toContain('3× thickness');
  expect(wingOverviewModel(layers, new Set(['skin'])).note).not.toContain('3× thickness');
});
