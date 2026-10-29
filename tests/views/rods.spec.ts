import { expect, test } from '@playwright/test';
import type { LepDesign } from '../../packages/format/src/index.ts';
import { rodsModel, wingOverviewLayers } from '../../packages/views/src/index.ts';
import { tubeSurface } from '../../packages/views/src/geometry.ts';
import { project } from '../format/helpers';

test('overview rods have round sections at their mm width around unchanged curves', () => {
  const { design, airfoils } = project('oracle/designs/swoop2');
  const draft: LepDesign = {
    ...design,
    joncs: {
      mode: 1,
      groups: [
        {
          group: 1,
          firstRib: 1,
          lastRib: 1,
          extrados: { from: 10, to: 50, deflection: 0, exponent: 1 },
          intrados: { from: 10, to: 30, deflection: 0, exponent: 1 },
          pocket: { offset: 0, outerWidth: 0, rodWidth: 2, innerWidth: 0 },
        },
      ],
    },
  };
  const schematic = rodsModel(draft, airfoils, -1, -1, -1).lines.filter((l) => l.kind === 'rod');
  const rods = wingOverviewLayers(draft, airfoils).rods;
  expect(schematic).toHaveLength(2);
  expect(rods.surfaces).toHaveLength(2);
  expect(rods.lines.filter((l) => l.kind === 'rod')).toEqual([]);
  rods.surfaces.forEach((surface, i) => {
    const path = schematic[i].points.filter(
      (p, j, all) => !j || p.some((v, a) => v !== all[j - 1][a]),
    );
    expect(surface.rows).toHaveLength(path.length);
    surface.rows.forEach((ring, j) => {
      for (const point of ring)
        expect(Math.hypot(...point.map((v, a) => v - path[j][a]))).toBeCloseTo(0.1, 8);
      for (let axis = 0; axis < 3; axis++)
        expect(ring.slice(0, -1).reduce((sum, p) => sum + p[axis], 0) / 12).toBeCloseTo(
          path[j][axis],
          8,
        );
    });
  });
  const missing = wingOverviewLayers(
    {
      ...draft,
      joncs: {
        mode: 1,
        groups:
          draft.joncs.mode === 1
            ? draft.joncs.groups.map((g) => ({ ...g, pocket: { ...g.pocket, rodWidth: 0 } }))
            : [],
      },
    },
    airfoils,
  ).rods;
  expect(missing.surfaces).toEqual([]);
  expect(missing.lines).toEqual(schematic);
});

test('tube sections handle repeated points and reversals without invalid coordinates', () => {
  const rows = tubeSurface(
    [
      [0, 0, 0],
      [0, 0, 0],
      [0, 1, 0],
      [0, 0, 0],
      [0, 0, 1],
    ],
    2,
  )!;
  expect(rows).toHaveLength(4);
  expect(rows.flat(2).every(Number.isFinite)).toBe(true);
  expect(
    tubeSurface(
      [
        [0, 0, 0],
        [0, 0, 0],
      ],
      2,
    ),
  ).toBeUndefined();
  expect(
    tubeSurface(
      [
        [0, 0, 0],
        [1, 0, 0],
      ],
      0,
    ),
  ).toBeUndefined();
});
