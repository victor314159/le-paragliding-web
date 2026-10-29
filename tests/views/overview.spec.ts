import { expect, test } from '@playwright/test';
import {
  OVERVIEW_LAYERS,
  linesModel,
  wingOverviewLayers,
  wingOverviewModel,
  type OverviewLayer,
} from '../../packages/views/src/index.ts';
import { DESIGNS, project } from '../format/helpers';
import { ANCHOR_COLORS } from '../../packages/views/src/profile.ts';
import { brakeLines, suspensionLines } from '../../packages/geometry/src/index.ts';

test('overview shows connected attachment points without spanwise tracks', () => {
  const { design, airfoils } = project('oracle/designs/swoop2');
  const draft = {
    ...design,
    anchors: design.anchors.map((anchor) => ({ ...anchor, count: 5 })),
    lines: {
      ...design.lines,
      plans: design.lines.plans.map((plan) => ({
        ...plan,
        paths: plan.paths.map((path) => ({ ...path, anchorRow: 1 })),
      })),
    },
  };
  const anchors = wingOverviewLayers(draft, airfoils).anchors;
  expect(new Set(anchors.dots.map((dot) => dot.color))).toEqual(
    new Set([ANCHOR_COLORS[0], ANCHOR_COLORS[5]]),
  );
  expect(anchors.lines).toEqual([]);
  const unused = wingOverviewLayers(
    { ...draft, lines: { ...draft.lines, plans: [] }, brakes: { ...draft.brakes, paths: [] } },
    airfoils,
  ).anchors;
  expect(unused.lines).toEqual([]);
  expect(unused.dots).toEqual([]);
});

for (const id of DESIGNS) {
  test(`overview assembles finite geometry and complete suspension without changing ${id}`, () => {
    const { design, airfoils } = project(`oracle/designs/${id}`);
    const before = JSON.stringify(design);
    const layers = wingOverviewLayers(design, airfoils);
    const model = wingOverviewModel(layers, new Set(OVERVIEW_LAYERS.map(([key]) => key)));
    expect(model.surfaces.length).toBeGreaterThan(0);
    expect(layers.ribs.fills.length).toBeGreaterThan(0);
    const points = [
      ...model.surfaces.flatMap((surface) => surface.rows.flat()),
      ...model.fills.flatMap((fill) => [...fill.points, ...(fill.holes ?? []).flat()]),
      ...model.lines.flatMap((line) => line.points),
      ...model.dots.map((dot) => dot.point),
    ];
    expect(points.every((point) => point.every(Number.isFinite))).toBe(true);
    const expected = linesModel(design, airfoils).lines.filter((line) => line.kind === 'line');
    // Solid line surfaces retain the same centerlines as the section schematics.
    const axes = model.surfaces
      .filter((surface) => surface.kind === 'line')
      .map((surface) =>
        surface.rows.map((row) => {
          const ring = row.slice(0, -1);
          return [0, 1, 2].map((axis) => ring.reduce((sum, p) => sum + p[axis], 0) / ring.length);
        }),
      );
    const key = (points: readonly (readonly number[])[]) =>
      points
        .flat()
        .map((v) => v.toFixed(6))
        .join(',');
    expect(
      [...axes, ...model.lines.filter((line) => line.kind === 'line').map((line) => line.points)]
        .map(key)
        .sort(),
    ).toEqual(expected.map((line) => key(line.points)).sort());
    expect(layers.lines.dots).toEqual([]);
    const suspension = suspensionLines(design, airfoils);
    const terminal = [...suspension, ...brakeLines(design, airfoils, suspension)].filter(
      (line) => line.level === line.levels,
    );
    const attachment = (point: readonly number[], color: string | undefined) =>
      `${color}/${key([point])}`;
    const connected = new Set(
      terminal.flatMap((line) =>
        [-1, 1].map((side) =>
          attachment([side * line.end[0], line.end[1], line.end[2]], ANCHOR_COLORS[line.row - 1]),
        ),
      ),
    );
    expect(new Set(layers.anchors.dots.map((dot) => attachment(dot.point, dot.color)))).toEqual(
      connected,
    );
    expect(layers.anchors.lines).toEqual([]);
    expect(model.lines.some((line) => line.selected)).toBe(false);
    expect(JSON.stringify(design)).toBe(before);
  });
}

test('hiding skin exposes internals without leaving colored surface patches or mutating layers', () => {
  const { design, airfoils } = project('oracle/designs/swoop2');
  const layers = wingOverviewLayers(design, airfoils);
  const before = JSON.stringify(layers);
  const visible = new Set<OverviewLayer>(['ribs', 'structure', 'colors']);
  const model = wingOverviewModel(layers, visible);
  expect(model.surfaces).toEqual(layers.structure.surfaces);
  expect(model.fills).toEqual([...layers.ribs.fills, ...layers.structure.fills]);
  expect(wingOverviewModel(layers, new Set()).surfaces).toEqual([]);
  expect(wingOverviewModel(layers, new Set()).lines).toEqual([]);
  expect(JSON.stringify(layers)).toBe(before);
});

test('inlet outlines follow the skin cutaway and disappear with the skin', () => {
  const { design, airfoils } = project('oracle/designs/swoop2');
  const layers = wingOverviewLayers(
    {
      ...design,
      glueVents: { mode: 1, ribs: design.geometry.ribs.map(() => ({ type: -2, parameters: [] })) },
    },
    airfoils,
  );
  expect(layers.skin.lines.some((line) => line.kind === 'vent')).toBe(true);
  expect(layers.ribs.lines.every((line) => line.kind === 'rib')).toBe(true);
  const visible = wingOverviewModel(layers, new Set(['skin', 'ribs']));
  expect(visible.lines.filter((line) => line.kind === 'vent').every((line) => line.cutaway)).toBe(
    true,
  );
  const hidden = wingOverviewModel(layers, new Set(['ribs']));
  expect(hidden.lines.some((line) => line.kind === 'vent')).toBe(false);
});

test('cutaway affects only skin and its markings, leaving internal geometry intact', () => {
  const { design, airfoils } = project('oracle/designs/swoop2');
  const layers = wingOverviewLayers(design, airfoils);
  const model = wingOverviewModel(layers, new Set(OVERVIEW_LAYERS.map(([key]) => key)));
  expect(model.cutaway!.min).toBeLessThan(0);
  expect(model.cutaway!.max).toBeGreaterThan(0);
  expect(model.cutaway!.feather).toBeGreaterThan(0);
  const skinRows = new Set([...layers.skin.surfaces, ...layers.colors.surfaces].map((s) => s.rows));
  for (const surface of model.surfaces) expect(!!surface.cutaway).toBe(skinRows.has(surface.rows));
  const internals = [...layers.ribs.fills, ...layers.structure.fills];
  for (const fill of internals) expect(model.fills).toContain(fill);
  expect(model.lines.filter((line) => line.kind === 'minirib').every((line) => !line.cutaway)).toBe(
    true,
  );
  const hidden = wingOverviewModel(layers, new Set(['ribs', 'structure', 'colors']));
  expect(hidden.cutaway).toBeUndefined();
  expect(hidden.surfaces.some((surface) => surface.cutaway)).toBe(false);
  expect(layers.skin.surfaces.every((surface) => !surface.cutaway)).toBe(true);
});
