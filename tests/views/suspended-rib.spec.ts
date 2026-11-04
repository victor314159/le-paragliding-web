import { expect, test } from '@playwright/test';
import {
  ribChord,
  ribPoint,
  suspensionLines,
  suspensionTriangles,
  type Point3,
  type SuspensionTriangle,
} from '@lepara/geometry/enhanced-v1';
import { holedRib } from '../../packages/views/src/model.ts';
import { contourPoint, ribProfile } from '../../packages/views/src/profile.ts';
import { suspendedRib } from '../../packages/views/src/suspended-rib.ts';
import { project } from '../format/helpers';

const close = (a: Point3, b: Point3) => a.every((value, axis) => Math.abs(value - b[axis]) < 1e-8);

test('bent fabric keeps the extrados fixed, replaces the old tips and leaves plain ribs unchanged', () => {
  const { design, airfoils } = project('oracle/designs/BHL7-22');
  const before = JSON.stringify(design);
  const triangles = suspensionTriangles(design, airfoils, suspensionLines(design, airfoils));
  const rib = suspendedRib(design, airfoils, 0, [], triangles)!;
  const profile = ribProfile(design, airfoils, 0);
  for (const local of profile.upper) {
    const fixed = ribPoint(design, 0, local)!;
    expect(rib.contour.some((p) => close(p, fixed))).toBe(true);
  }
  for (const {
    row,
    points: [, , tip],
  } of triangles.filter(({ rib }) => rib === 1)) {
    const local = contourPoint(profile.lower, design.anchors[0].positions[row - 1] / 100)!;
    const old = ribPoint(design, 0, local)!;
    expect(rib.contour.some((p) => close(p, tip))).toBe(true);
    expect(rib.contour.some((p) => close(p, old))).toBe(false);
    expect(rib.fills.some((fill) => fill.points.some((p) => close(p, old)))).toBe(false);
  }
  const plain = suspendedRib(design, airfoils, 14, [], triangles)!;
  expect(plain.contour).toEqual(holedRib(design, airfoils, 14, [])!.contour);
  const ds = project('oracle/designs/swoop');
  const double = suspendedRib(ds.design, ds.airfoils, 0, [], []);
  expect(double!.contour).toEqual(holedRib(ds.design, ds.airfoils, 0, [])!.contour);
  expect(JSON.stringify(design)).toBe(before);
});

for (const { name, holes, removed } of [
  { name: 'inside', holes: [[40, 0, 10, 5, 0, 0]], removed: 0.005 },
  {
    name: 'side by side',
    holes: [
      [30, 0, 10, 5, 0, 0],
      [60, 0, 10, 5, 0, 0],
    ],
    removed: 0.01,
  },
]) {
  test(`fabric mesh removes holes ${name} without filling them`, () => {
    const { design, airfoils } = project('oracle/designs/BHL7-22');
    const foils = new Map(airfoils);
    foils.set(design.airfoils[0].airfoil, {
      format: 'txt',
      extrados: 2,
      inlet: 2,
      intrados: 2,
      points: [
        [1, 0.1],
        [0, 0.1],
        [0, -0.1],
        [1, -0.1],
      ],
    });
    const anchor: [number, number] = [design.anchors[0].positions[1] / 100, 0.1];
    const tip = ribPoint(design, 0, anchor)!;
    const stationary: SuspensionTriangle[] = [
      { rib: 1, row: 2, base: [0, 1], anchor, points: [tip, tip, tip] },
    ];
    const rib = suspendedRib(
      design,
      foils,
      0,
      holes.map(([x, y, width, height, rotation, corner]) => ({
        type: 4,
        parameters: [x, y, width, height, rotation, corner, 0] as const,
      })),
      stationary,
    )!;
    const area = rib.fills.reduce((sum, { points: [a, b, c] }) => {
      const u = b.map((v, i) => v - a[i]),
        v = c.map((value, i) => value - a[i]);
      return (
        sum +
        Math.hypot(
          u[1] * v[2] - u[2] * v[1],
          u[2] * v[0] - u[0] * v[2],
          u[0] * v[1] - u[1] * v[0],
        ) /
          2
      );
    }, 0);
    expect(area / ribChord(design, 0) ** 2).toBeCloseTo(0.2 - removed, 10);
    expect(rib.fills.every((fill) => fill.points.length === 3)).toBe(true);
  });
}

test('lines reaching the same anchor pull it once, to their mean tip', () => {
  const { design, airfoils } = project('oracle/designs/BHL7-22');
  const [triangle] = suspensionTriangles(design, airfoils, suspensionLines(design, airfoils));
  const tip = triangle.points[2];
  const twice: SuspensionTriangle[] = [
    { ...triangle, points: [triangle.points[0], triangle.points[1], [tip[0] - 1, tip[1], tip[2]]] },
    { ...triangle, points: [triangle.points[0], triangle.points[1], [tip[0] + 1, tip[1], tip[2]]] },
  ];
  const rib = suspendedRib(design, airfoils, triangle.rib - 1, [], twice)!;
  expect(rib.contour.some((p) => close(p, tip))).toBe(true);
});
