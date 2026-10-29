import { expect, test } from '@playwright/test';
import {
  skinCut,
  skinRegion,
  skinOverwidths,
  wingModel,
  wingOverviewLayers,
  type SkinPanel,
} from '../../packages/views/src/index.ts';
import { DESIGNS, project } from '../format/helpers';

for (const id of DESIGNS) {
  test(`skin and colored panels share identical mirrored facet grids on ${id}`, () => {
    const { design, airfoils } = project(`oracle/designs/${id}`);
    for (const ballooning of [false, true]) {
      const panels: SkinPanel[] = [];
      const model = wingModel(design, airfoils, {
        panels,
        overwidths: ballooning ? skinOverwidths(design) : undefined,
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

test('ballooning leaves rib edges fixed and pinches the skin midway over miniribs', () => {
  const { design, airfoils } = project('oracle/designs/swoop2');
  const input = { ...design, airfoils: design.airfoils.map((row) => ({ ...row, minirib: 50 })) };
  const flat: SkinPanel[] = [],
    inflated: SkinPanel[] = [];
  wingModel(input, airfoils, { panels: flat });
  wingModel(input, airfoils, { panels: inflated, overwidths: tension(5) });
  const skin = inflated.find((p) => p.cell === 1 && p.surface === 'extrados')!;
  const original = flat.find((p) => p.cell === skin.cell && p.surface === skin.surface)!;
  expect(skin.rows[0].map((p) => p.point)).toEqual(original.rows[0].map((p) => p.point));
  expect(skin.rows.at(-1)!.map((p) => p.point)).toEqual(original.rows.at(-1)!.map((p) => p.point));
  const middle = skin.rows[skin.rows.length >> 1];
  let bulged = false,
    pinched = false;
  middle.forEach((p, k) => {
    const a = original.rows[0][k].point,
      b = original.rows[1][k].point;
    const distance = Math.hypot(...p.point.map((v, axis) => v - (a[axis] + b[axis]) / 2));
    if (p.chord <= 50) {
      expect(distance).toBeLessThan(1e-9);
      pinched = true;
    } else if (distance > 0.01) bulged = true;
  });
  expect(bulged && pinched).toBe(true);
});

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
  const active = skinOverwidths(grouped);
  expect(typeof active === 'function' && active(0)).toEqual(tension(0));
  const straight = wingOverviewLayers(grouped, airfoils, false);
  expect(straight.skin.note).toContain('straight between ribs');
});
