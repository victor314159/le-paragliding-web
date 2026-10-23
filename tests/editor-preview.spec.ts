import { expect, test } from '@playwright/test';
import { holeOutline } from '../src/app/editor/preview-geometry.ts';

test('ellipses use engine semi-axes, chord percentages and radians', () => {
  const ellipse = holeOutline({ type: 1, parameters: [30, 2, 8, 3, Math.PI / 2, null, null] });
  expect(ellipse).toBeDefined();
  const points = ellipse!.points;
  expect(points[0][0]).toBeCloseTo(0.3);
  expect(points[0][1]).toBeCloseTo(0.06);
  expect(Math.min(...points.map(([x]) => x))).toBeCloseTo(0.27);
  expect(Math.max(...points.map(([x]) => x))).toBeCloseTo(0.33);
  expect(Math.min(...points.map(([, y]) => y))).toBeCloseTo(-0.1);
});

test('triangles rotate only their base, and negative bases extend left', () => {
  const triangle = holeOutline({ type: 3, parameters: [40, -2, -10, 6, 30, 0, 0] });
  expect(triangle).toBeDefined();
  expect(triangle!.points[0]).toEqual([0.4, 0.02]);
  expect(triangle!.points[1][0]).toBeCloseTo(0.4 - 0.1 * Math.cos(Math.PI / 6));
  expect(triangle!.points[1][1]).toBeCloseTo(-0.03);
  expect(triangle!.points[2][0]).toBe(0.4);
  expect(triangle!.points[2][1]).toBeCloseTo(-0.04);
});

test('rounded triangles and rectangles keep circular corners in both directions', () => {
  for (const width of [12, -12]) {
    for (const type of [3, 4]) {
      const outline = holeOutline({ type, parameters: [40, -2, width, 6, 0, 1, 0] });
      expect(outline).toBeDefined();
      expect(outline!.path.match(/ A0.01,0.01 /g)).toHaveLength(type === 3 ? 3 : 4);
      const corner = /^M([^,]+),([^ ]+) A([^,]+),([^ ]+) 0 0 [01] ([^,]+),([^ ]+)/.exec(
        outline!.path,
      );
      expect(corner).not.toBeNull();
      const coordinates = corner!.slice(1).map(Number);
      // The first circular fillet touches the vertical and horizontal sides
      // exactly one radius away from the reference corner, also when mirrored.
      expect(coordinates[0]).toBeCloseTo(0.4);
      expect(coordinates[1]).toBeCloseTo(0.01);
      expect(coordinates[2]).toBeCloseTo(0.01);
      expect(coordinates[3]).toBeCloseTo(0.01);
      expect(coordinates[4]).toBeCloseTo(0.4 + Math.sign(width) * 0.01);
      expect(coordinates[5]).toBeCloseTo(0.02);
      expect(outline!.path).not.toMatch(/NaN|Infinity/);
      expect(outline!.path).toMatch(/ Z$/);
    }
  }
});

test('unsupported holes and incomplete or impossible dimensions are not drawn', () => {
  for (const hole of [
    { type: 2, parameters: [40, 0, 12, 6, 0, 0, 0] },
    { type: 1, parameters: [null, 0, 12, 6, 0, 0, 0] },
    { type: 1, parameters: [40, 0, 0, 6, 0, 0, 0] },
    { type: 3, parameters: [40, 0, 12, 6, 0, 20, 0] },
    { type: 4, parameters: [40, 0, 12, 6, 0, -1, 0] },
  ])
    expect(holeOutline(hole)).toBeUndefined();
});

// Numerical fixtures keep drawing coordinates independent of the browser's SVG rendering.
import {
  contourPoint,
  offsetProfile,
  ribProfile,
  frontPoint,
} from '../src/app/editor/preview-model.ts';
import { toForm, type DesignForm } from '../src/app/editor/editor-draft.ts';
import { parseLep, type LepAirfoil } from '../packages/format/src/index.ts';
import { lep, ok } from './format/helpers';

function previewDesign(): DesignForm {
  const initial = toForm(ok(parseLep(lep())));
  return {
    ...initial,
    geometry: {
      ...initial.geometry,
      wingScale: 2,
      washin: { mode: 0, maxAngle: 0, centerAngle: 0 },
      ribs: [
        {
          ...initial.geometry.ribs[0],
          x: 0,
          yLE: 0,
          yTE: 100,
          xp: 25,
          z: 10,
          beta: 0,
          washin: 0,
          rotationPoint: 25,
          rotZ: 0,
          rotZPosition: 25,
        },
      ],
    },
    airfoils: [
      { ...initial.airfoils[0], airfoil: 'a.dat', displacement: 0, intakeStart: 20, intakeEnd: 40 },
    ],
    anchors: [{ number: 1, count: 1, positions: [25, 0, 0, 0, 0, 100] }],
    thickness: { mode: 1, ribs: [2] },
  };
}

test('profile previews interpolate the intrados, apply thickness and use the scaled chord', () => {
  const foil: LepAirfoil = {
    format: 'dat',
    points: [
      [1, 0],
      [0.5, 0.1],
      [0, 0],
      [0.5, -0.1],
      [1, 0],
    ],
  };
  const profile = ribProfile(previewDesign(), new Map([['a.dat', foil]]), 0);
  expect(profile.chord).toBe(200);
  expect(profile.anchors[0].x).toBe(0.25);
  expect(profile.anchors[0].y).toBeCloseTo(0.1);
  expect(profile.anchors[0].onSurface).toBe(true);
  expect(profile.intake).toMatch(/^M/);
  expect(contourPoint(profile.lower, 1.1)).toBeUndefined();
  const flat = ribProfile(
    { ...previewDesign(), thickness: { mode: 1, ribs: [0] } },
    new Map([['a.dat', foil]]),
    0,
  );
  expect(flat.points.every(([, y]) => y === 0)).toBe(true);
});

test('seam offsets stay outside the contour in either winding and handle repeated endpoints', () => {
  for (const points of [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ],
    [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0],
    ],
  ] as const) {
    const offset = offsetProfile(points, 0.1);
    expect(Math.min(...offset.map(([x]) => x))).toBeCloseTo(-0.1);
    expect(Math.max(...offset.map(([x]) => x))).toBeCloseTo(1.1);
    expect(Math.min(...offset.map(([, y]) => y))).toBeCloseTo(-0.1);
    expect(Math.max(...offset.map(([, y]) => y))).toBeCloseTo(1.1);
  }
  expect(
    offsetProfile(
      [
        [0, 0],
        [1, 0],
        [0, 0],
      ],
      0.1,
    ),
  ).toEqual([]);
});

test('front projections respect rib inclination, twist and vertical-axis rotation', () => {
  const design = previewDesign();
  expect(frontPoint(design, 0, [0.5, 0.1])).toEqual([25, 20]);
  const change = (values: Partial<DesignForm['geometry']['ribs'][number]>) => ({
    ...design,
    geometry: { ...design.geometry, ribs: [{ ...design.geometry.ribs[0], ...values }] },
  });
  const inclined = frontPoint(change({ beta: 90 }), 0, [0.5, 0.1])!;
  expect(inclined[0]).toBeCloseTo(15);
  expect(inclined[1]).toBeCloseTo(10);
  const rotated = frontPoint(change({ rotZ: 90 }), 0, [0.5, 0.1])!;
  expect(rotated[0]).toBeCloseTo(0);
  expect(rotated[1]).toBeCloseTo(20);
  expect(frontPoint(change({ washin: 90 }), 0, [0.5, 0.1])![1]).toBeCloseTo(35);
  expect(frontPoint(change({ beta: null }), 0, [0.5, 0.1])).toBeUndefined();
});
