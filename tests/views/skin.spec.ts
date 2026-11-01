import { expect, test } from '@playwright/test';
import {
  skinCut,
  skinRegion,
  wingModel,
  wingOverviewLayers,
  type SkinPanel,
} from '../../packages/views/src/index.ts';
import { balloonedSkin } from '@lepara/geometry/enhanced-v1';
import { DESIGNS, project } from '../format/helpers';

for (const id of DESIGNS) {
  test(`skin and colored panels share identical mirrored facet grids on ${id}`, () => {
    const { design, airfoils } = project(`oracle/designs/${id}`);
    for (const ballooning of [false, true]) {
      const panels: SkinPanel[] = [];
      const model = wingModel(design, airfoils, {
        panels,
        skin: ballooning ? balloonedSkin(design, airfoils) : undefined,
      });
      const key = (rows: readonly (readonly (readonly number[])[])[]) => JSON.stringify(rows);
      const grids = new Set(model.surfaces.map((surface) => key(surface.rows)));
      expect(panels.length).toBeGreaterThan(0);
      for (const panel of panels) {
        const right = panel.rows.map((row) => row.map((p) => p.point));
        const left = right.map((row) => row.map(([x, y, z]) => [-x, y, z]));
        expect(grids.has(key(right))).toBe(true);
        expect(grids.has(key(left))).toBe(true);
      }
    }
  });
}

// Two facets meeting at the balloon's crown, parameterized from TE to LE.
const panel: SkinPanel = {
  cell: 1,
  surface: 'extrados',
  rows: [0, 0.5, 1].map((span) =>
    [0, 100].map((chord) => ({
      span,
      chord,
      point: [span, chord / 100, span === 0.5 ? 1 : 0],
    })),
  ),
};

test('slanted color regions and cuts stay exactly on ballooned facets', () => {
  const from = { left: 20, right: 40 },
    to = { left: 70, right: 80 };
  const rows = skinRegion(panel, from, to);
  expect(rows.length).toBeGreaterThan(0);
  for (const [x, y, z] of rows.flat(2)) {
    expect(z).toBeCloseTo(x <= 0.5 ? 2 * x : 2 - 2 * x, 12);
    expect(y).toBeGreaterThanOrEqual((20 + 20 * x) / 100 - 1e-12);
    expect(y).toBeLessThanOrEqual((70 + 10 * x) / 100 + 1e-12);
  }
  const cut = skinCut(panel, { left: 30, right: 60 }).flat();
  expect(Math.max(...cut.map((p) => p[2]))).toBe(1);
  expect(Math.min(...cut.map((p) => p[0]))).toBe(0);
  expect(Math.max(...cut.map((p) => p[0]))).toBe(1);
  for (const [x, y, z] of cut) {
    expect(y).toBeCloseTo(0.3 + 0.3 * x, 12);
    expect(z).toBeCloseTo(x <= 0.5 ? 2 * x : 2 - 2 * x, 12);
  }
});

const tension = (value: number) => {
  const point = (position: number) => ({
    extradosPosition: position,
    intradosPosition: position,
    extradosOverwidth: value,
    intradosOverwidth: value,
  });
  return [point(0), point(20), point(40), point(60), point(80), point(100)] as const;
};

test('overview ballooning uses the last matching section 31 group instead of section 5', () => {
  const { design, airfoils } = project('oracle/designs/swoop2');
  const group = {
    group: 1,
    firstRib: 1,
    lastRib: design.geometry.ribs.length,
    type: 1,
    points: tension(0),
  };
  const grouped = {
    ...design,
    skinTension: { ...design.skinTension, points: tension(10) },
    skinTensionGroups: { mode: 1 as const, groups: [{ ...group, points: tension(5) }, group] },
  };
  const zero = {
    ...design,
    skinTension: { ...design.skinTension, points: tension(0) },
    skinTensionGroups: { mode: 0 as const },
  };
  expect(wingOverviewLayers(grouped, airfoils).skin.surfaces).toEqual(
    wingOverviewLayers(zero, airfoils).skin.surfaces,
  );
  expect(wingOverviewLayers(grouped, airfoils).skin.note).toContain('section 31');
  const straight = wingOverviewLayers(grouped, airfoils, false);
  expect(straight.skin.note).toContain('straight between ribs');
});

test('overview retains the ballooned mesh of closed glue vents', () => {
  const { design, airfoils } = project('oracle/designs/swoop2');
  const input = {
    ...design,
    glueVents: { mode: 1 as const, ribs: design.airfoils.map(() => ({ type: 1, parameters: [] })) },
  };
  const inlets = balloonedSkin(input, airfoils).filter((p) => p.surface === 'inlet');
  expect(inlets.length).toBeGreaterThan(0);
  const grids = new Set(
    wingOverviewLayers(input, airfoils).skin.surfaces.map((s) => JSON.stringify(s.rows)),
  );
  for (const panel of inlets)
    expect(grids.has(JSON.stringify(panel.rows.map((row) => row.map((p) => p.point))))).toBe(true);
});

test('a mesh the draft cannot produce falls back to the straight skin', () => {
  const { design, airfoils } = project('oracle/designs/swoop2');
  const straight = wingModel(design, airfoils);
  const fallback = wingModel(design, airfoils, { skin: [] });
  expect(fallback.surfaces.length).toBeGreaterThan(0);
  expect(fallback.surfaces).toEqual(straight.surfaces);
  expect(fallback.note).toContain('straight between ribs');
});
