import { expect, test } from '@playwright/test';
import { balloonedSkin as enhancedSkin } from '@lepara/geometry/enhanced-v1';
import { balloonedSkin as fortranSkin } from '@lepara/geometry/fortran-3.29';
import { arcHeight, arcPoint } from '../../packages/geometry/src/enhanced/circular-arc.ts';
import { skinPatterns } from '../../packages/geometry/src/fortran/skin-patterns.ts';
import { skinRibs } from '../../packages/geometry/src/fortran/skin-ribs.ts';
import type { BalloonedPanel, SkinRib } from '../../packages/geometry/src/shared/skin-types.ts';
import { DAT_FIXTURE, DESIGNS, project } from '../format/helpers';

/** The first station of a surface on its rib. */
const surfaceStart = (rib: SkinRib, surface: BalloonedPanel['surface']) =>
  surface === 'extrados' ? 1 : surface === 'inlet' ? rib.upper : rib.upper + rib.inlet - 1;
const distance = (a: readonly number[], b: readonly number[]) =>
  Math.hypot(...a.map((v, i) => v - b[i]));
// Recover a circle's length from its measured chord and sagitta, independently
// of the solver's bisection and series.
const circleLength = (chord: number, height: number) => {
  const radius = (chord * chord) / (8 * height) + height / 2;
  return 4 * radius * Math.atan2(2 * height, chord);
};

test('circular arcs preserve fabric length across scales and small/large surpluses', () => {
  for (const chord of [1e-9, 0.01, 1, 100, 1e9])
    for (const ratio of [1 + 4 * Number.EPSILON, 1 + 1e-10, 1.0001, 1.05, 1.5, 2, 10]) {
      const length = chord * ratio;
      const height = arcHeight(chord, length);
      expect(height).toBeGreaterThan(0);
      expect(Math.abs(circleLength(chord, height) - length) / length).toBeLessThan(5e-14);
      expect(arcPoint(chord, height, 0)).toEqual({ span: 0, lift: 0 });
      expect(arcPoint(chord, height, 1)).toEqual({ span: 1, lift: 0 });
      expect(Math.abs(arcPoint(chord, height, 0.5).lift - height) / height).toBeLessThan(5e-14);
    }
});

test('arc samples converge to the fabric length and retain shallow inflation', () => {
  const chord = 100,
    length = 105,
    height = arcHeight(chord, length);
  const polyline = (segments: number) => {
    const samples = Array.from({ length: segments + 1 }, (_, k) => {
      const p = arcPoint(chord, height, k / segments);
      return [p.span * chord, p.lift];
    });
    return samples.slice(1).reduce((sum, p, k) => sum + distance(p, samples[k]), 0);
  };
  const coarse = polyline(12),
    fine = polyline(1024);
  expect(coarse).toBeLessThan(fine);
  expect(fine).toBeLessThan(length);
  expect(length - fine).toBeLessThan(0.00001);
  // Unlike the reference's 0.01 cm cut-off, arbitrarily small positive surplus remains visible.
  expect(arcHeight(1, 1.000001)).toBeGreaterThan(0);
  expect(arcHeight(1, 1.000001)).toBeLessThan(0.01);
  for (const [d, l] of [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
    [1, 0.9],
    [NaN, 2],
    [1, Infinity],
  ])
    expect(arcHeight(d, l)).toBe(0);
});

for (const directory of [...DESIGNS.map((id) => `oracle/designs/${id}`), DAT_FIXTURE]) {
  test(`${directory}: enhanced skin is finite, immutable and attached to its source ribs`, () => {
    const { design, airfoils } = project(directory);
    const before = structuredClone({ design, airfoils });
    const reference = fortranSkin(design, airfoils);
    const ribs = skinRibs(design, airfoils, (v) => v);
    const skin = enhancedSkin(design, airfoils);
    expect(skin.map((p) => [p.cell, p.surface])).toEqual(reference.map((p) => [p.cell, p.surface]));
    for (const [i, panel] of skin.entries()) {
      expect(panel.rows.length).toBe(reference[i].rows.length);
      expect(
        panel.rows.flat().every((v) => [...v.point, v.span, v.chord].every(Number.isFinite)),
      ).toBe(true);
      // Outer seam, and inner seam except for the free middle of a central cell.
      for (const row of panel.cell === 0 ? [-1] : [0, -1]) {
        const actual = panel.rows.at(row)!;
        const rib = ribs[panel.cell + (row === -1 ? 1 : 0)];
        const from = surfaceStart(rib, panel.surface);
        for (let j = 0; j < actual.length; j++)
          expect(distance(actual[j].point, rib.points[from + j])).toBeLessThan(1e-9);
      }
    }
    expect({ design, airfoils }).toEqual(before);
  });
}

test('the central cell uses its own fabric length instead of the next cell height', () => {
  const { design, airfoils } = project('oracle/designs/A8');
  const ribs = skinRibs(design, airfoils, (v) => v);
  const patterns = skinPatterns(design, ribs, (v) => v);
  const skin = enhancedSkin(design, airfoils);
  const panel = skin.find((p) => p.cell === 0 && p.surface === 'extrados')!;
  const j = Math.floor(ribs[1].upper / 2),
    a = ribs[0].points[j],
    b = ribs[1].points[j];
  const center = a.map((v, i) => (v + b[i]) / 2);
  const height = distance(panel.rows[0][j - 1].point, center);
  const fabric = distance(patterns.upper[0].left[j], patterns.upper[0].right[j]);
  expect(height).toBeGreaterThan(0);
  expect(Math.abs(circleLength(distance(a, b), height) - fabric)).toBeLessThan(1e-10);
});

// Compile-time interchangeability: clients keep the same named functional API.
const compatible: typeof fortranSkin = enhancedSkin;
test('both model functions have the same contract', () => expect(compatible).toBe(enhancedSkin));

test('inflation is perpendicular to both the local span and the contour tangent', () => {
  const { design, airfoils } = project('oracle/designs/swoop2');
  const ribs = skinRibs(design, airfoils, (v) => v),
    inner = ribs[1],
    outer = ribs[2];
  const panel = enhancedSkin(design, airfoils).find(
    (p) => p.cell === 1 && p.surface === 'extrados',
  )!;
  const j = Math.floor(outer.upper / 2);
  const median = (k: number) => inner.points[k].map((v, axis) => (v + outer.points[k][axis]) / 2);
  const center = median(j),
    before = median(j - 1),
    after = median(j + 1);
  const inflated = panel.rows[Math.floor(panel.rows.length / 2)][j - 1].point;
  const displacement = inflated.map((v, axis) => v - center[axis]);
  const span = outer.points[j].map((v, axis) => v - inner.points[j][axis]);
  const tangent = after.map((v, axis) => v - before[axis]);
  const length = Math.hypot(...displacement);
  expect(length).toBeGreaterThan(0);
  for (const direction of [span, tangent]) {
    const cosine =
      displacement.reduce((sum, v, axis) => sum + v * direction[axis], 0) /
      (length * Math.hypot(...direction));
    expect(Math.abs(cosine)).toBeLessThan(1e-12);
  }
});

test('miniribs sew both skins at mid-cell and conserve each half-panel fabric length', () => {
  const { design, airfoils } = project('oracle/designs/A8');
  const plain = { ...design, airfoils: design.airfoils.map((r) => ({ ...r, minirib: 0 })) };
  const constrained = {
    ...plain,
    airfoils: plain.airfoils.map((r, i) => ({ ...r, minirib: i <= 1 ? 25 : 0 })),
  };
  const before = structuredClone(constrained);
  const original = enhancedSkin(plain, airfoils);
  const skin = enhancedSkin(constrained, airfoils);
  const ribs = skinRibs(constrained, airfoils, (v) => v);
  const patterns = skinPatterns(constrained, ribs, (v) => v);
  let checked = 0;
  for (const [index, panel] of skin.entries()) {
    if (panel.cell > 1 || panel.surface === 'inlet') {
      expect(panel).toEqual(original[index]);
      continue;
    }
    const a = ribs[panel.cell],
      b = ribs[panel.cell + 1];
    const from = surfaceStart(b, panel.surface);
    const flat = (panel.surface === 'extrados' ? patterns.upper : patterns.lower)[panel.cell];
    const middle = panel.cell === 0 ? 0 : (panel.rows.length - 1) / 2;
    for (let n = 0; n < panel.rows[0].length; n++) {
      const j = from + n;
      const chord = 100 * (1 - (a.local[j][0] / a.chord + b.local[j][0] / b.chord) / 2);
      if (chord > 25) {
        for (let row = 0; row < panel.rows.length; row++)
          expect(panel.rows[row][n]).toEqual(original[index].rows[row][n]);
        continue;
      }
      const center = a.points[j].map((v, axis) => (v + b.points[j][axis]) / 2);
      expect(distance(panel.rows[middle][n].point, center)).toBeLessThan(1e-10);
      // Recover the outer half arc from its endpoints and measured midpoint sagitta.
      const quarter = center.map((v, axis) => (v + b.points[j][axis]) / 2);
      const sample = panel.rows[(middle + panel.rows.length - 1) / 2][n].point;
      const height = distance(sample, quarter);
      const fabric = distance(flat.left[j], flat.right[j]);
      const halfChord = distance(center, b.points[j]);
      if (height > 1e-8 && fabric > 2 * halfChord) {
        expect(Math.abs(circleLength(halfChord, height) - fabric / 2)).toBeLessThan(1e-9);
        checked++;
      }
    }
  }
  expect(checked).toBeGreaterThan(20);
  expect(constrained).toEqual(before);
  // Section 2 miniribs must not change the faithful engine mesh.
  expect(fortranSkin(constrained, airfoils)).toEqual(fortranSkin(plain, airfoils));
});

for (const count of [1, 5, 97]) {
  test(`miniribs retain the exact seam with ${count} requested subdivisions`, () => {
    const { design, airfoils } = project('oracle/designs/A8');
    const draft = {
      ...design,
      specialParameters: { mode: 1 as const, entries: [{ code: 1291 as const, value: count }] },
      airfoils: design.airfoils.map((r) => ({ ...r, minirib: 25 })),
    };
    const ribs = skinRibs(draft, airfoils, (v) => v);
    for (const panel of enhancedSkin(draft, airfoils)) {
      const middle = panel.cell === 0 ? 0 : (panel.rows.length - 1) / 2;
      expect(Number.isInteger(middle)).toBe(true);
      const inner = ribs[panel.cell],
        outer = ribs[panel.cell + 1];
      // First upper station is the trailing edge, always within the minirib.
      if (panel.surface === 'extrados') {
        const center = inner.points[1].map((v, axis) => (v + outer.points[1][axis]) / 2);
        expect(distance(panel.rows[middle][0].point, center)).toBeLessThan(1e-10);
        expect(panel.rows[middle][0].span).toBe(panel.cell === 0 ? 0 : 0.5);
      }
      expect(panel.rows.flat().every((p) => p.point.every(Number.isFinite))).toBe(true);
    }
  });
}

test('minirib markers outside (1, 100), and single-skin triangles, do not constrain ballooning', () => {
  for (const id of ['A8', 'swoop2']) {
    const { design, airfoils } = project(`oracle/designs/${id}`);
    const plain = { ...design, airfoils: design.airfoils.map((r) => ({ ...r, minirib: 0 })) };
    const expected = enhancedSkin(plain, airfoils);
    for (const marker of [-5, 1, 100, NaN])
      expect(
        enhancedSkin(
          {
            ...plain,
            airfoils: plain.airfoils.map((r) => ({ ...r, minirib: marker })),
          },
          airfoils,
        ),
      ).toEqual(expected);
    const ss = { ...plain, geometry: { ...plain.geometry, paragliderType: 'ss' as const } };
    expect(
      enhancedSkin(
        {
          ...ss,
          airfoils: ss.airfoils.map((r) => ({ ...r, minirib: 25 })),
        },
        airfoils,
      ),
    ).toEqual(enhancedSkin(ss, airfoils));
  }
});
