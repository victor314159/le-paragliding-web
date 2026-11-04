import { expect, test } from '@playwright/test';
import {
  ribPatterns as enhancedRibs,
  balloonedSkin as enhancedSkin,
  skinPanels as enhancedPanels,
  anchorPoint as enhancedAnchor,
  brakeLines as enhancedBrakes,
  miniribPatterns as enhancedMiniribs,
  ribAirfoil,
  ribPoint,
  suspensionLines as enhancedLines,
  suspensionTriangles as enhancedTriangles,
  unloadedRibPatterns as enhancedUnloadedRibs,
  vRibPatterns as enhancedVRibs,
  vRibs as enhancedVRibGeometry,
} from '@lepara/geometry/enhanced-v1';
import {
  ribPatterns as fortranRibs,
  balloonedSkin as fortranSkin,
  skinPanels as fortranPanels,
  unloadedRibPatterns,
  vRibPatterns as fortranVRibs,
} from '@lepara/geometry/fortran-3.29';
import { arcHeight, arcPoint } from '../../packages/geometry/src/enhanced/circular-arc.ts';
import { cellHeights } from '../../packages/geometry/src/enhanced/skin.ts';
import { romanDots } from '../../packages/geometry/src/fortran/marks.ts';
import { stations as enhancedStations } from '../../packages/geometry/src/enhanced/stations.ts';
import { brakeAnchors } from '../../packages/geometry/src/fortran/anchors.ts';
import { lineSteps } from '../../packages/geometry/src/enhanced/lines.ts';
import {
  sewnMarks,
  sewnSeam,
  patternSteps,
  sewnSides,
} from '../../packages/geometry/src/enhanced/panel-steps.ts';
import { skinPatterns } from '../../packages/geometry/src/fortran/skin-patterns.ts';
import { skinRibs } from '../../packages/geometry/src/fortran/skin-ribs.ts';
import type { BalloonedPanel, SkinRib } from '../../packages/geometry/src/shared/skin-types.ts';
import type { LepDesign } from '../../packages/format/src/index.ts';
import { DAT_FIXTURE, DESIGNS, project } from '../format/helpers';
import { VARIANTS, variantFiles } from '../format/variants';

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
    const ribs = skinRibs(design, airfoils, (v) => v, enhancedStations);
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
  const patterns = skinPatterns(constrained, ribs, (v) => v, patternSteps);
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
      // Ahead of the minirib, the skin frees itself over half the cell's width.
      const free = (100 * distance(a.points[j], b.points[j])) / (a.chord + b.chord);
      if (chord > 25 + free) {
        for (let row = 0; row < panel.rows.length; row++)
          expect(panel.rows[row][n]).toEqual(original[index].rows[row][n]);
        continue;
      }
      if (chord > 25) continue;
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

test('the skin follows a minirib transition, its fabric conserved, then frees itself', () => {
  const { design, airfoils } = project('oracle/designs/A8');
  const draft = {
    ...design,
    specialParameters: {
      mode: 1 as const,
      entries: [
        { code: 1291 as const, value: 97 },
        { code: 3001 as const, transition: 3 as const, values: [6, 0.85] as const },
      ],
    },
    airfoils: design.airfoils.map((r) => ({ ...r, minirib: 20 })),
  };
  const ribs = skinRibs(draft, airfoils, (v) => v);
  const patterns = skinPatterns(draft, ribs, (v) => v, patternSteps);
  const panel = enhancedSkin(draft, airfoils).find(
    (p) => p.cell === 5 && p.surface === 'extrados',
  )!;
  const [a, b] = [ribs[5], ribs[6]];
  const flat = patterns.upper[5];
  const middle = (panel.rows.length - 1) / 2;
  const off: number[] = [];
  const stretched: number[] = [];
  panel.rows[0].forEach((_, n) => {
    const j = panel.from + n;
    const across = panel.rows.map((row) => row[n].point);
    const fabric = distance(flat.left[j], flat.right[j]);
    if (fabric > distance(a.points[j], b.points[j])) {
      const length = across.slice(1).reduce((sum, p, k) => sum + distance(across[k], p), 0);
      stretched.push(Math.abs(length - fabric) / fabric);
    }
    const center = a.points[j].map((v, axis) => (v + b.points[j][axis]) / 2);
    off.push(distance(across[middle], center));
  });
  expect(Math.max(...stretched)).toBeLessThan(1e-3);
  // Sewn on the median at the tail, lifted along the transition, freed ahead.
  const rising = off.slice(0, off.findIndex((v, n) => n > 1 && v > 0) + 6);
  expect(off[0]).toBeLessThan(1e-10);
  expect(rising.at(-1)!).toBeGreaterThan(0);
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

test('enhanced panels: the reference pieces, their side cut lines the allowance off their sewing', () => {
  for (const id of DESIGNS) {
    const input = project(`oracle/designs/${id}`);
    const { airfoils } = input;
    const design: LepDesign = { ...input.design, shaping: { mode: 0 } };
    const reference = fortranPanels(design, airfoils),
      panels = enhancedPanels(design, airfoils);
    const shape = (p: (typeof panels)[number]) => [
      p.cell,
      p.surface,
      p.piece,
      p.sewing.length,
      p.cut.length,
      p.joins.length,
      p.holes.length,
    ];
    expect(panels.map(shape), id).toEqual(reference.map(shape));
    const ribs = skinRibs(design, airfoils, (value) => value);
    const patterns = skinPatterns(design, ribs, (value) => value, patternSteps);
    for (const [surface, upper] of [
      ['upper', true],
      ['lower', false],
    ] as const) {
      const margin = design.sewingAllowances[surface].sides / 10;
      patterns[surface].slice(0, -1).forEach((panel, i) => {
        const seam = patterns.seams[surface][i];
        const [from, to] = upper
          ? [1, ribs[i].upper]
          : [ribs[i].upper + ribs[i].inlet - 1, ribs[i].points.length - 1];
        for (let j = from; j <= to; j++)
          for (const side of ['left', 'right'] as const)
            expect(
              distance(seam[side][j], panel[side][j]),
              `${id} ${surface} ${i} ${j}`,
            ).toBeCloseTo(margin, 9);
      });
    }
  }
});

test('enhanced 3D-shaping seams follow its ballooning, the pieces as the reference', () => {
  const { design, airfoils } = project('oracle/designs/gnu-test-3.19');
  const reference = fortranPanels(design, airfoils),
    panels = enhancedPanels(design, airfoils);
  const pieces = (list: typeof panels) => list.map((p) => [p.cell, p.surface, p.piece]);
  expect(pieces(panels)).toEqual(pieces(reference));
  expect(panels.some((p) => p.piece > 0)).toBe(true);
  for (const panel of panels) expect(panel.cut.flat().every(Number.isFinite)).toBe(true);
});

test('enhanced cut lines end the rib allowance off the trailing edge, joined across it', () => {
  for (const id of [...DESIGNS, DAT_FIXTURE]) {
    const { design, airfoils } = project(id === DAT_FIXTURE ? id : `oracle/designs/${id}`);
    for (const rib of enhancedRibs(design, airfoils)) {
      expect(rib.cut).toHaveLength(1);
      const [line, sewing] = [rib.cut[0], rib.sewing];
      expect(line.at(-1), `${id} rib ${rib.rib + 1}`).toEqual(line[0]);
      const cut = line.slice(0, -1);
      for (const [a, b] of [
        [cut[0], sewing[0]],
        [cut.at(-1)!, sewing.at(-1)!],
      ])
        expect(distance(a, b), `${id} rib ${rib.rib + 1}`).toBeCloseTo(
          design.sewingAllowances.ribs / 10,
          9,
        );
    }
  }
});

test('enhanced rib patterns are the reference ones in double precision', () => {
  for (const id of DESIGNS) {
    const { design, airfoils } = project(`oracle/designs/${id}`);
    const reference = fortranRibs(design, airfoils),
      ribs = enhancedRibs(design, airfoils);
    const points = (r: (typeof ribs)[number], cut: (typeof ribs)[number]['cut'] = r.cut) => [
      ...r.sewing,
      ...cut.flat(),
      ...r.holes.flat(),
    ];
    // Without the line that closes the enhanced cut, which the engine does not draw.
    const open = (r: (typeof ribs)[number]) => points(r, [r.cut[0].slice(0, -1)]);
    expect(
      ribs.map((r) => open(r).length),
      id,
    ).toEqual(reference.map((r) => points(r).length));
    let worst = 0;
    ribs.forEach((rib, i) => {
      const expected = points(reference[i]);
      open(rib).forEach((p, j) => (worst = Math.max(worst, distance(p, expected[j]))));
    });
    expect(worst, id).toBeLessThan(1e-3);
  }
});

test('enhanced "pc" ribs cut their closed nose at its corners, their mylars closed along it', () => {
  for (const id of ['A8', 'swoop2', 'gnuC2-27']) {
    const input = project(`oracle/designs/${id}`);
    const design: LepDesign = {
      ...input.design,
      geometry: { ...input.design.geometry, paragliderType: 'pc' },
      // Ending inside A8's inlet (1.6 to 6.3 % of chord).
      noseMylars: {
        mode: 1,
        groups: [{ group: 1, firstRib: 1, lastRib: 3, values: [10, 6, 1, 4, 2, 1] }],
      },
    };
    const ribs = skinRibs(design, input.airfoils).slice(1);
    const allowance = design.sewingAllowances.ribs / 10;
    enhancedRibs(design, input.airfoils).forEach((pattern, i) => {
      const { upper, inlet } = ribs[i];
      if (pattern.sewing.every(([, v]) => v === 0)) return;
      expect(pattern.cut, `${id} rib ${i + 1}`).toHaveLength(1);
      const [cut] = pattern.cut;
      // The extrados' and the intrados' points, two corners on the nose's offset
      // line, and its first point again, across the trailing edge.
      expect(cut).toHaveLength(pattern.sewing.length + 3);
      expect(cut.at(-1)).toEqual(cut[0]);
      const [a, b] = [pattern.sewing[upper - 1], pattern.sewing[upper]];
      const across = ([u, v]: readonly number[]) =>
        ((b[0] - a[0]) * (v - a[1]) - (b[1] - a[1]) * (u - a[0])) / distance(a, b);
      for (const corner of cut.slice(upper, upper + 2))
        expect(Math.abs(Math.abs(across(corner)) - allowance), `${id} rib ${i + 1}`).toBeLessThan(
          1e-9,
        );
      expect(inlet).toBeGreaterThan(1);
      if (id === 'A8' && pattern.mylar) {
        expect(pattern.mylar.outline, `rib ${i + 1} mylar`).toHaveLength(1);
        const [outline] = pattern.mylar.outline;
        expect(distance(outline[0], outline.at(-1)!)).toBe(0);
        expect(Math.abs(across(pattern.mylar.edge.at(-1)!))).toBeLessThan(1e-9);
      }
    });
  }
});

test('enhanced V-ribs: finite, closed holes, V-rib allowance, strip cuts and own numbers', () => {
  const variants = VARIANTS.filter(({ name }) => name.startsWith('hv-ribs'));
  const inputs = [
    ...DESIGNS.map((id) => project(`oracle/designs/${id}`)),
    ...variants.map((variant) => project(variant.name, variantFiles(variant))),
  ];
  const types = new Set<number>();
  for (const { design, airfoils } of inputs) {
    const allowance = design.sewingAllowances.vRibs / 10;
    const reference = fortranVRibs(design, airfoils);
    const pieces = enhancedVRibs(design, airfoils);
    expect(pieces).toHaveLength(reference.length);
    pieces.forEach((piece) => {
      types.add(piece.type);
      const label = `type ${piece.type} ribs ${piece.ribs.join('-')}`;
      const points = [...piece.cut.flat(), ...piece.holes.flat(), ...piece.marks, ...piece.numeral];
      expect(
        points.every((p) => p.every(Number.isFinite)),
        label,
      ).toBe(true);
      for (const hole of piece.holes)
        expect(distance(hole[0], hole.at(-1)!), label).toBeLessThan(1e-9);
      // The end rows and both edges, but type 5's anchored edge, cut between its anchors.
      if (piece.type !== 5) expect(piece.cut, label).toHaveLength(4);
      // Type 5's other edge, the V-ribs' allowance off it.
      else
        for (const p of piece.cut[2].slice(1, -1))
          expect(
            piece.sewing.some((q) => Math.abs(distance(p, q) - allowance) < 1e-9),
            label,
          ).toBe(true);
      if (piece.type === 6)
        expect(piece.numeral.length, label).toBe(
          piece.ribs.reduce((sum, rib) => sum + romanDots(rib, [0, 0], 0, 1).length, 0),
        );
    });
  }
  expect([...types].sort()).toEqual([1, 2, 3, 4, 5, 6]);
});

test('enhanced unloaded ribs: their cell sides as sewn, type 11 holes, seams on one side', () => {
  for (const [id, type] of [
    ['gnuC-27', 'ds'],
    ['A8', 'ds'],
    ['A8', 'pc'],
  ] as const) {
    const input = project(`oracle/designs/${id}`);
    const design: LepDesign = {
      ...input.design,
      geometry: { ...input.design.geometry, paragliderType: type },
      airfoils: input.design.airfoils.map((row, k) =>
        k >= 5 && k <= 9 ? { ...row, minirib: 100 } : row,
      ),
      holes: [
        ...input.design.holes,
        {
          firstRib: 6,
          lastRib: 10,
          holes: [
            { type: 11, parameters: [40, 2, 6, 4, 0.2, 0, 0] },
            { type: 1, parameters: [65, 1, 5, 3, 0, 0, 0] },
          ],
        },
        // The engine reads the type 11 holes back on rib 10, which this row overrides.
        { firstRib: 10, lastRib: 10, holes: [{ type: 1, parameters: [30, 1, 5, 3, 0, 0, 0] }] },
      ],
    };
    const label = `${id} (${type})`;
    expect(
      unloadedRibPatterns(design, input.airfoils).flatMap((r) => r.holes),
      label,
    ).toEqual([]);
    const ribs = skinRibs(design, input.airfoils);
    const patterns = skinPatterns(design, ribs, (v) => v, patternSteps);
    const length = (points: readonly (readonly number[])[]) =>
      points.slice(1).reduce((sum, p, j) => sum + distance(p, points[j]), 0);
    for (const rib of enhancedUnloadedRibs(design, input.airfoils)) {
      expect(rib.holes, label).toHaveLength(1);
      const before = ribs[rib.rib - 1];
      const sides = sewnSides(design, before, patterns, rib.rib - 1);
      const midline = sides.left.map((p, j) => [0, 1].map((c) => (p[c] + sides.right[j][c]) / 2));
      expect(
        Math.abs(
          length(rib.sewing.slice(0, before.upper)) - length(midline.slice(1, before.upper + 1)),
        ),
        `${label} rib ${rib.rib}`,
      ).toBeLessThan(1e-6);
      const seam = sewnSeam(sides, before, design.marks.spacing, 0.5);
      for (const dots of [seam.extrados, seam.intrados])
        for (const { at, point } of dots.slice(2)) {
          const [p, q] = [midline[at], midline[at + 1]];
          const cross = (q[0] - p[0]) * (point[1] - p[1]) - (q[1] - p[1]) * (point[0] - p[0]);
          expect(cross * Math.sign(q[0] - p[0]), `${label} rib ${rib.rib}`).toBeGreaterThan(0);
        }
    }
  }
});

test('enhanced panel marks run on across all pieces of a surface', () => {
  // Three straight pieces of 10 cm, both sides along u, a mark every 3 cm.
  const piece = (from: number) => ({
    left: [0, 4.5, 10].map((d): [number, number] => [from + d, 0]),
    right: [0, 4.5, 10].map((d): [number, number] => [from + d, 20]),
  });
  const pieces = [piece(0), piece(10), piece(20)];
  for (const backwards of [false, true]) {
    const marks = sewnMarks(pieces, pieces, backwards, 3, 0.5).map((m) => m.slice(4));
    // 3, 6, ... 30 from the start, on both sides: 0 cannot be marked.
    const along = marks
      .flat()
      .filter(([, v]) => v < 10)
      .map(([u]) => (backwards ? 30 - u : u));
    expect(along.sort((a, b) => a - b).map((u) => Math.round(u))).toEqual(
      Array.from({ length: 10 }, (_, k) => 3 * (k + 1)),
    );
  }
});

test('enhanced panel marks run on across a piece too short for one', () => {
  const piece = (from: number, to: number) => {
    const edge: readonly [number, number][] = [
      [from, 0],
      [to, 0],
    ];
    return { left: edge, right: edge };
  };
  const pieces = [piece(0, 6), piece(6, 8), piece(8, 18)];
  const marks = sewnMarks(pieces, pieces, false, 5, 0);
  expect(marks[1].slice(4)).toEqual([]);
  // 5 from the first piece's mark at 5, on each side: past the short piece.
  expect(marks[2].slice(4).map(([u]) => u)).toEqual([10, 15, 10, 15]);
});

test('enhanced panel anchors are marked outwards on both sides, in the allowance', () => {
  const inside = (p: readonly number[], polygon: readonly (readonly number[])[]) => {
    let odd = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [a, b] = [polygon[i], polygon[j]];
      if (
        a[1] > p[1] !== b[1] > p[1] &&
        p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
      )
        odd = !odd;
    }
    return odd;
  };
  const input = project('oracle/designs/gnuC-27');
  for (const type of [1, 2, 3]) {
    const design: LepDesign = {
      ...input.design,
      markTypes: input.design.markTypes.map((row, k) =>
        k === 4 ? { ...row, laser: { type, size: 2, offset: 2 } } : row,
      ),
    };
    const panels = enhancedPanels(design, input.airfoils).filter((p) => p.surface === 'intrados');
    const marks = panels.flatMap((panel) =>
      [...panel.anchors.dots, ...panel.anchors.lines.flat()].map((point) => ({ panel, point })),
    );
    expect(marks.length, `type ${type}`).toBeGreaterThan(0);
    for (const { panel, point } of marks)
      expect(
        !inside(point, panel.sewing) && inside(point, panel.cut),
        `type ${type} cell ${panel.cell} ${point.join()}`,
      ).toBe(true);
  }
});

test('enhanced rods: true arcs of their deflection, own deflections, kept points', () => {
  const pocket = { offset: 2, outerWidth: 9.35, rodWidth: 6.3, innerWidth: 9.35 };
  const arc = (
    group: number,
    firstRib: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ) => ({
    group,
    firstRib,
    lastRib: firstRib,
    x1,
    y1,
    x2,
    y2,
    deflection: 1.5,
    pocket,
  });
  const curve = (deflection: number) => ({ from: 20, to: 30, deflection, exponent: 2 });
  const long = (group: number, firstRib: number, final: number) => ({
    group,
    firstRib,
    lastRib: firstRib,
    initial: curve(0),
    final: { ...curve(final), from: 60, to: 70 },
    pocket,
  });
  const input = project('oracle/designs/gnuC2-27');
  const design: LepDesign = {
    ...input.design,
    holes: [
      { firstRib: 1, lastRib: 2, holes: [{ type: 4, parameters: [40, -2, 10, 4, 0, 1, 0] }] },
    ],
    joncs: {
      mode: 2,
      blocs: [
        ...(input.design.joncs.mode === 2 ? input.design.joncs.blocs : []),
        // Rising and falling steep arcs, after a rectangle hole.
        { number: 2, type: 2, groups: [arc(1, 3, 30, -4, 33, 6), arc(2, 4, 33, 6, 30, -4)] },
        { number: 3, type: 4, groups: [long(1, 5, 0), long(2, 5, 2)] },
      ],
    },
  };
  const ribs = enhancedRibs(design, input.airfoils);
  for (const rib of ribs)
    for (const rod of rib.rods) {
      expect(rod.line.flat().every(Number.isFinite), `rib ${rib.rib + 1}`).toBe(true);
      rod.line.slice(1).forEach((p, k) => expect(distance(p, rod.line[k])).toBeGreaterThan(1e-9));
    }
  // Both arcs bulge by 1.5 % of chord off their chord, on the same side.
  const bulges = [2, 3].map((index) => {
    const { line } = ribs[index].rods.find((rod) => rod.type === 2)!;
    const [a, b] = [line[0], line.at(-1)!];
    const across = ([u, v]: readonly number[]) =>
      ((b[0] - a[0]) * (v - a[1]) - (b[1] - a[1]) * (u - a[0])) / distance(a, b);
    const chord = skinRibs(design, input.airfoils)[index + 1].chord;
    const offsets = line.map(across);
    const top = offsets.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a));
    // Its 41 points sample the arc: their top is its sagitta within a mm.
    expect(Math.abs(Math.abs(top) - (1.5 * chord) / 100), `rib ${index + 1}`).toBeLessThan(0.1);
    return Math.sign(top) * Math.sign(b[1] - a[1]);
  });
  expect(bulges[0]).toBe(bulges[1]);
  // A type 4 rod's final part, deflected by its own deflection: 2 % of chord at its end.
  const [plain, bent] = ribs[4].rods.filter((rod) => rod.type === 4).map((rod) => rod.line);
  const chord = skinRibs(design, input.airfoils)[5].chord;
  expect(plain[0][1] - bent[0][1]).toBeCloseTo((2 * chord) / 100, 9);
  expect(bent.at(-1)).toEqual(plain.at(-1));
  // The shark nose's upper rod passes its extrados start, its lower rod its intrados start.
  const bloc = input.design.joncs.mode === 2 ? input.design.joncs.blocs[0] : undefined;
  expect(bloc?.type).toBe(3);
  if (bloc?.type === 3) {
    const shark = bloc.groups[0];
    const c = skinRibs(design, input.airfoils)[1].chord;
    const [upper, lower] = ribs[0].rods.filter((rod) => rod.type === 3).map((rod) => rod.line);
    expect(upper.some(([u]) => Math.abs(u - (shark.extrados.from * c) / 100) < 1e-9)).toBe(true);
    expect(lower.some(([u]) => Math.abs(u - (shark.intrados.from * c) / 100) < 1e-9)).toBe(true);
  }
});

test('enhanced lines: exact lengths, own risers, clamped anchors, fractional brakes, turned triangles', () => {
  const input = project('oracle/designs/gnuC-27');
  const design: LepDesign = {
    ...input.design,
    // An anchor in the inlet, before the intrados.
    anchors: input.design.anchors.map((row, k) =>
      k === 2
        ? {
            ...row,
            positions: [
              1,
              row.positions[1],
              row.positions[2],
              row.positions[3],
              row.positions[4],
              row.positions[5],
            ] as const,
          }
        : row,
    ),
    brakes: {
      ...input.design.brakes,
      paths: input.design.brakes.paths.map((path, k) =>
        k === 0 ? { ...path, anchorRib: Math.trunc(path.anchorRib) + 0.5 } : path,
      ),
    },
  };
  const lines = enhancedLines(design, input.airfoils);
  const risers = lines.filter((line) => line.level === 1);
  for (const riser of risers)
    expect(distance(riser.start, riser.end)).toBeCloseTo(design.angleOfAttack.risersLength, 9);
  for (const line of lines.filter((l) => l.level === 2))
    expect(
      risers.some((riser) => riser.plan === line.plan && distance(riser.end, line.start) === 0),
    ).toBe(true);
  // The anchor at 1 % on the intrados' first point, not the leading edge.
  const clamped = enhancedAnchor(design, input.airfoils, 3, 1)!;
  const { points, extrados } = ribAirfoil(design, input.airfoils, 2);
  expect(distance(clamped, ribPoint(design, 2, points[extrados - 1], true)!)).toBeLessThan(1e-9);
  // The fractional brake path ends halfway between its ribs' brake anchors.
  const path = design.brakes.paths[0];
  const brakes = enhancedBrakes(design, input.airfoils, lines);
  const rib = Math.trunc(path.anchorRib);
  const end = brakes.find((l) => l.level === path.levels && l.anchorRib === path.anchorRib)!.end;
  const anchors = brakeAnchors(design, input.airfoils, design.brakes.paths, lineSteps);
  const [here, next] = [anchors.get(rib)!, anchors.get(rib + 1)!];
  expect(path.anchorRow).toBe(6);
  expect(
    distance(
      end,
      [0, 1, 2].map((k) => (here[k] + next[k]) / 2),
    ),
  ).toBeLessThan(1e-9);
  // Single skin: each triangle's tip points, across its base, to its line's start.
  const ss = project('oracle/designs/BHL7-22');
  const ssLines = enhancedLines(ss.design, ss.airfoils);
  const triangles = enhancedTriangles(ss.design, ss.airfoils, ssLines);
  expect(triangles.length).toBeGreaterThan(0);
  for (const {
    rib,
    row,
    points: [p1, p2, tip],
  } of triangles) {
    const line = ssLines.find((l) => l.rib === rib && l.row === row && l.level === l.levels)!;
    const axis = [0, 1, 2].map((k) => p2[k] - p1[k]);
    const norm = Math.hypot(...axis);
    const across = (p: readonly number[]) => {
      const t = [0, 1, 2].reduce((s, k) => s + (p[k] - p1[k]) * axis[k], 0) / norm / norm;
      return [0, 1, 2].map((k) => p[k] - p1[k] - axis[k] * t);
    };
    const [a, b] = [across(tip), across(line.start)];
    const cos = a.reduce((s, v, k) => s + v * b[k], 0) / Math.hypot(...a) / Math.hypot(...b);
    expect(cos).toBeCloseTo(1, 9);
  }
});

test('enhanced minirib transitions start from the heights of their own cell, as the skin', () => {
  const { design, airfoils } = project('oracle/designs/gnuC-27');
  const eased = {
    ...design,
    specialParameters: {
      mode: 1,
      entries: [{ code: 3001, transition: 1, values: [5, 0.7] }],
    },
  } as LepDesign;
  const heights = cellHeights(
    eased,
    skinRibs(eased, airfoils, (value) => value, enhancedStations),
  );
  const plain = enhancedMiniribs(design, airfoils);
  const miniribs = enhancedMiniribs(eased, airfoils);
  expect(miniribs.length).toBeGreaterThan(0);
  miniribs.forEach((minirib, k) => {
    // Its cut line holds e71(1), e72(1 to je + 1) and e71(je + 1): the front of its extrados.
    const front = minirib.cut[0].length - 3;
    const raised = minirib.sewing[front][1] - plain[k].sewing[front][1];
    expect(raised).toBeCloseTo(0.7 * heights[minirib.rib - 1][front], 9);
  });
});

test('enhanced type 6 V-ribs join and mark the rib they go to', () => {
  const input = project('oracle/designs/gnuC-27');
  const k = input.design.hvRibs.ribs.findIndex((row) => row.type === 6);
  expect(k).toBeGreaterThanOrEqual(0);
  const row = input.design.hvRibs.ribs[k];
  const from = Math.trunc(row.parameters[0]);
  // Column 8: the rib it goes to, two ribs on.
  const design: LepDesign = {
    ...input.design,
    hvRibs: {
      ...input.design.hvRibs,
      ribs: input.design.hvRibs.ribs.map((r, i) =>
        i === k ? { ...r, parameters: r.parameters.map((p, c) => (c === 5 ? from + 2 : p)) } : r,
      ),
    },
  };
  const piece = enhancedVRibGeometry(design, input.airfoils).find((v) => v.rows.includes(k + 1))!;
  expect(piece.ribs).toEqual([from, from + 2]);
  // Its far edge in the plane of rib from + 2 (span x).
  const x = ribPoint(design, from + 1, [0.5, 0])![0];
  for (const p of piece.edges[1]) expect(Math.abs(p[0] - x)).toBeLessThan(0.05 * Math.abs(x));
  const ribs = enhancedRibs(design, input.airfoils);
  expect(ribs[from + 1].vRibs.lines.length).toBeGreaterThan(0);
});

test('enhanced .dat stations take section 33 thickness, their inlet ends on points', () => {
  const { design, airfoils } = project(DAT_FIXTURE);
  design.airfoils.forEach((row, index) => {
    const read = enhancedStations(design, airfoils, index)!;
    const { points } = ribAirfoil(design, airfoils, index);
    // The airfoil's points scaled as the 3D ribs, those at its inlet's ends on them.
    for (const p of read.points)
      expect(
        points.some((q) => distance(p, q) < 1e-12) ||
          p[0] === row.intakeStart / 100 ||
          p[0] === row.intakeEnd / 100,
      ).toBe(true);
    expect(read.points[read.upper - 1][0]).toBeCloseTo(row.intakeStart / 100, 2);
    expect(read.points[read.upper + read.inlet - 2][0]).toBeCloseTo(row.intakeEnd / 100, 2);
  });
});
