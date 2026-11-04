import { expect, test } from '@playwright/test';
import { ribPatterns, skinPanels, type Point3 } from '@lepara/geometry/enhanced-v1';
import { SEAM_CONVENTIONS } from '@lepara/design';
import { assembly } from '../../packages/views/src/index.ts';
import { DESIGNS, project } from '../format/helpers';

type Flat = readonly [number, number];
const toSegment = (p: Flat, a: Flat, b: Flat) => {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
const toRing = (p: Flat, ring: readonly Flat[], closed = true) =>
  Math.min(
    ...ring
      .slice(0, closed ? undefined : -1)
      .map((a, i) => toSegment(p, a, ring[(i + 1) % ring.length])),
  );
const box = (points: readonly Flat[]) => ({
  u: Math.min(...points.map((p) => p[0])),
  v: Math.min(...points.map((p) => p[1])),
});
/** `points` of the table, moved onto `pattern` by their lower left corners: a move, no more. */
function onPattern(points: readonly Point3[], pattern: readonly Flat[]) {
  const [a, b] = [box(points.map(([x, y]): Flat => [x, y])), box(pattern)];
  return points.map(([x, y]): Flat => [x - a.u + b.u, y - a.v + b.v]);
}
const finite = (rings: readonly (readonly Point3[])[]) =>
  rings.every((ring) => ring.every((p) => p.every(Number.isFinite)));

for (const id of DESIGNS)
  test(`${id}: laid flat, every piece of a cell is its pattern, as the 2D preview draws it`, () => {
    const { design, airfoils } = project(`oracle/designs/${id}`);
    const pieces = assembly(design, airfoils);
    expect(pieces.cells.length).toBeGreaterThan(0);
    const panels = skinPanels(design, airfoils);
    const ribs = ribPatterns(design, airfoils);
    for (const cell of pieces.cells) {
      const model = pieces.model(cell);
      const own = panels.filter((panel) => panel.cell === cell);
      const skins = model.surfaces.filter((s) => s.kind === 'skin');
      expect(skins).toHaveLength(own.length);
      const flaps = model.surfaces.filter((s) => s.kind === 'flap');
      const table = new Set(
        [...model.surfaces, ...model.fills].flatMap((s) => s.opening!.flat.flat()).map((p) => p[2]),
      );
      expect(table.size).toBe(1);
      skins.forEach((surface, i) => {
        const panel = own[i];
        const { flat, apart } = surface.opening!;
        expect(finite(surface.rows) && finite(apart) && finite(flat)).toBe(true);
        // Its edges and corners on the sewing line, and the sewing line on them.
        const edge = [
          ...flat[0],
          ...flat[flat.length - 1],
          ...flat.map((row) => row[0]),
          ...flat.map((row) => row[row.length - 1]),
        ];
        const laid = onPattern(flat.flat(), panel.sewing);
        const outline = onPattern(edge, panel.sewing);
        const sum = laid.length;
        expect(sum).toBeGreaterThan(0);
        for (const p of outline) expect(toRing(p, panel.sewing)).toBeLessThan(1e-6);
        const edgeRing = outline;
        for (const p of panel.sewing)
          expect(
            Math.min(...edgeRing.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1]))),
          ).toBeLessThan(1e-6);
      });
      for (const { rows, opening } of flaps) {
        expect(finite(rows) && finite(opening!.apart) && finite(opening!.flat)).toBe(true);
        expect(opening!.flat[1]).toHaveLength(rows[1].length);
      }
      const inner = ribs[Math.max(cell - 1, 0)];
      const outer = ribs[cell];
      model.fills.forEach((fill, r) => {
        const rib = r ? outer : inner;
        const points = onPattern(fill.opening!.flat[0], rib.sewing);
        points.forEach((p, i) =>
          expect(Math.hypot(p[0] - rib.sewing[i][0], p[1] - rib.sewing[i][1])).toBeLessThan(1e-6),
        );
      });
    }
  });

for (const id of DESIGNS)
  test(`${id}: the cut lines close around each panel, as cut`, () => {
    const { design, airfoils } = project(`oracle/designs/${id}`);
    const pieces = assembly(design, airfoils);
    const panels = skinPanels(design, airfoils);
    const cell = pieces.cells[pieces.cells.length >> 1];
    const model = pieces.model(cell);
    const own = panels.filter((panel) => panel.cell === cell);
    // The panels' allowances, in fours: the ribs' have their color.
    const ribColor = model.fills[0].color;
    const flaps = model.surfaces.filter((s) => s.kind === 'flap' && s.color !== ribColor);
    own.forEach((panel, i) => {
      const rows = flaps.slice(i * 4, i * 4 + 4).map((flap) => flap.opening!.flat[1]);
      expect(rows).toHaveLength(4);
      const [skin] = [model.surfaces.filter((s) => s.kind === 'skin')[i].opening!.flat];
      const [lowest] = [box(skin.flat().map(([x, y]): Flat => [x, y]))];
      const sewing = box(panel.sewing);
      const moved = rows
        .flat()
        .map(([x, y]): Flat => [x - lowest.u + sewing.u, y - lowest.v + sewing.v]);
      for (const p of moved) expect(toRing(p, panel.cut)).toBeLessThan(1e-6);
      for (const p of panel.cut)
        expect(Math.min(...moved.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1])))).toBeLessThan(
          1e-6,
        );
    });
  });

for (const id of DESIGNS)
  test(`${id}: every seam sews together`, () => {
    const { design, airfoils } = project(`oracle/designs/${id}`);
    const pieces = assembly(design, airfoils);
    for (const cell of pieces.cells) {
      const own = skinPanels(design, airfoils).filter((panel) => panel.cell === cell);
      const checks = pieces.checks(cell);
      const shaping = own.filter((panel) => panel.piece > 0).length;
      expect(checks).toHaveLength(2 * own.length + shaping);
      for (const { seam, difference, marks } of checks) {
        expect(Math.abs(difference), seam).toBeLessThan(SEAM_CONVENTIONS.seamTolerance);
        expect(marks, seam).toBeLessThan(SEAM_CONVENTIONS.seamTolerance);
        // Laid by its fabric's length, a mark comes under a millimetre from the rib's.
        expect(marks, seam).toBeLessThan(0.1);
      }
    }
  });

test('the table has a grid around the pieces laid flat', () => {
  const { design, airfoils } = project('oracle/designs/swoop2');
  const pieces = assembly(design, airfoils);
  const model = pieces.model(pieces.cells[0]);
  const { length, lines } = model.grid!;
  const flat = model.lines.flatMap((line) => line.opening!.flat);
  const [xs, ys] = [lines.map((p) => p[0]), lines.map((p) => p[1])];
  expect(lines.length % 2).toBe(0);
  for (const [x, y] of flat) {
    expect(x).toBeGreaterThanOrEqual(Math.min(...xs));
    expect(x).toBeLessThanOrEqual(Math.max(...xs));
    expect(y).toBeGreaterThanOrEqual(Math.min(...ys));
    expect(y).toBeLessThanOrEqual(Math.max(...ys));
  }
  xs.forEach((x) => expect(Math.abs(x / length - Math.round(x / length))).toBeLessThan(1e-9));
});

for (const id of DESIGNS)
  test(`${id}: pieces rest on the table, and never go through it`, () => {
    const { design, airfoils } = project(`oracle/designs/${id}`);
    const pieces = assembly(design, airfoils);
    const model = pieces.model(pieces.cells[pieces.cells.length >> 1]);
    const table = model.grid!.lines[0][2];
    const lowest = (rings: readonly (readonly Point3[])[]) =>
      Math.max(...rings.flat().map((p) => p[2]));
    const items = [...model.surfaces, ...model.fills];
    const sewn = model.surfaces.map(({ rows }) => lowest(rows));
    expect(Math.abs(Math.max(...sewn) - table)).toBeLessThan(0.2);
    for (const { opening } of items)
      for (const step of [...opening!.before, opening!.apart, ...opening!.between, opening!.flat])
        expect(lowest(step)).toBeLessThan(table + 0.2);
  });

test('a model draws only its visible layers', () => {
  const { design, airfoils } = project('oracle/designs/swoop2');
  const pieces = assembly(design, airfoils);
  const [cell] = pieces.cells;
  const all = pieces.model(cell);
  expect(pieces.model(cell, new Set())).toMatchObject({
    surfaces: [],
    fills: [],
    lines: [],
    dots: [],
  });
  const ribs = pieces.model(cell, new Set(['rib']));
  expect(ribs.fills).toHaveLength(all.fills.length);
  expect(ribs.surfaces.every((surface) => surface.kind === 'flap')).toBe(true);
  const kinds = pieces.model(cell, new Set(['extrados'])).surfaces.map((surface) => surface.kind);
  expect(new Set(kinds)).toEqual(new Set(['skin', 'flap']));
  expect(pieces.model(cell, new Set(['marks'])).dots).toHaveLength(all.dots.length);
});

test('a panel side longer than its rib shows on that seam, and only there', () => {
  const { design, airfoils } = project('oracle/designs/swoop2');
  const panels = skinPanels(design, airfoils);
  const cell = 13;
  // Its left side stretched 2 %, as a pattern cut wrong would be.
  const stretch = ([u, v]: Flat): Flat => [u, v * 1.02];
  const wrong = panels.map((panel) => {
    if (panel.cell !== cell || panel.surface !== 'extrados') return panel;
    const left = panel.ribEdges.left.map(stretch) as [number, number][];
    const key = ([u, v]: Flat) => `${u},${v}`;
    const moved = new Map(panel.ribEdges.left.map((p, i) => [key(p), left[i]]));
    return {
      ...panel,
      sewing: panel.sewing.map((p) => moved.get(key(p)) ?? p),
      ribEdges: { ...panel.ribEdges, left },
    };
  });
  const off = assembly(design, airfoils, wrong)
    .checks(cell)
    .filter(({ difference }) => Math.abs(difference) > SEAM_CONVENTIONS.seamTolerance);
  expect(off.map(({ seam }) => seam)).toEqual([`extrados 1 left side on rib ${cell}`]);
  expect(off[0].difference).toBeGreaterThan(1);
  expect(
    assembly(design, airfoils, wrong)
      .model(cell)
      .lines.some((l) => l.color),
  ).toBe(true);
  expect(
    assembly(design, airfoils)
      .model(cell)
      .lines.some((l) => l.color),
  ).toBe(false);
});

for (const id of DESIGNS)
  test(`${id}: pieces flatten on the spot, then move onto the table rigid`, () => {
    const { design, airfoils } = project(`oracle/designs/${id}`);
    const pieces = assembly(design, airfoils);
    const model = pieces.model(pieces.cells[pieces.cells.length >> 1]);
    const span = (ring: readonly Point3[]) =>
      ring.flatMap((p, i) =>
        [(i + 7) % ring.length, (i + 41) % ring.length].map((j) =>
          Math.hypot(p[0] - ring[j][0], p[1] - ring[j][1], p[2] - ring[j][2]),
        ),
      );
    for (const item of [...model.surfaces, ...model.fills]) {
      const { between, flat } = item.opening!;
      expect(between.length).toBeGreaterThan(2);
      for (const pose of between)
        pose.forEach((ring, r) => {
          const [got, wanted] = [span(ring), span(flat[r])];
          got.forEach((d, i) => expect(Math.abs(d - wanted[i])).toBeLessThan(1e-6));
        });
    }
    const { before, between } = model.fills[0].opening!;
    expect(model.openingAt).toHaveLength(before.length + 2 + between.length);
  });

for (const id of DESIGNS)
  test(`${id}: allowances swing open about their seams, on an arc, once apart`, () => {
    const { design, airfoils } = project(`oracle/designs/${id}`);
    const pieces = assembly(design, airfoils);
    const model = pieces.model(pieces.cells[pieces.cells.length >> 1]);
    const reach = (rows: readonly (readonly Point3[])[]) =>
      rows[0].map((p, i) => Math.hypot(...p.map((v, a) => v - rows[1][i][a])));
    for (const { rows, kind, opening } of model.surfaces) {
      if (kind !== 'flap') continue;
      const [sewn, open] = [reach(rows), reach(opening!.apart)];
      // The piece moves apart folded, as sewn.
      reach(opening!.before[0]).forEach((length, i) => expect(length).toBeCloseTo(sewn[i], 6));
      opening!.before.forEach((step) => {
        // The seam stays put, and each point keeps its distance from it.
        expect(step[0]).toEqual(opening!.before[0][0]);
        reach(step).forEach((length, i) => {
          expect(length).toBeGreaterThan(Math.min(sewn[i], open[i]) - 1e-6);
          expect(length).toBeLessThan(Math.max(sewn[i], open[i]) + 1e-6);
        });
      });
    }
  });

for (const id of DESIGNS)
  test(`${id}: an allowance opens as wide as it is cut, its corners off to the side`, () => {
    const { design, airfoils } = project(`oracle/designs/${id}`);
    const pieces = assembly(design, airfoils);
    const model = pieces.model(pieces.cells[pieces.cells.length >> 1]);
    for (const { rows, kind, opening } of model.surfaces) {
      if (kind !== 'flap') continue;
      const width = (line: readonly (readonly Point3[])[]) =>
        line[1].map((p, i) => Math.hypot(...p.map((v, a) => v - line[0][i][a])));
      const [open, flat] = [width(opening!.apart), width(opening!.flat)];
      open.forEach((value, i) => expect(Math.abs(value - flat[i])).toBeLessThan(0.15));
      expect(rows).toHaveLength(2);
    }
  });

test('allowances folded along a rib stay inside it, where the wing is thinner than they are', () => {
  const { design, airfoils } = project('oracle/designs/swoop2');
  const model = assembly(design, airfoils).model(5);
  const inside = (ring: readonly Point3[], [, y, z]: Point3) => {
    let odd = false;
    ring.forEach(([, y1, z1], i) => {
      const [, y2, z2] = ring[(i + 1) % ring.length];
      if (z1 > z !== z2 > z && y < y1 + ((z - z1) * (y2 - y1)) / (z2 - z1)) odd = !odd;
    });
    return odd;
  };
  const meanX = (points: readonly Point3[]) =>
    points.reduce((sum, p) => sum + p[0], 0) / points.length;
  let outside = 0;
  for (const { rows } of model.surfaces.filter((s) => s.kind === 'flap' && s.rows[0].length > 40)) {
    const x = meanX(rows[0]);
    const { points: ring } = model.fills.reduce((a, b) =>
      Math.abs(meanX(a.points) - x) < Math.abs(meanX(b.points) - x) ? a : b,
    );
    rows[0].forEach(([sx, sy, sz], i) => {
      const [ox, oy, oz] = rows[1][i];
      // Past a fold's layer, what a flap of no width keeps at the rib's sharp end.
      const folded = Math.hypot(ox - sx, oy - sy, oz - sz) > 0.25;
      if (folded && !inside(ring, [(sx + ox) / 2, (sy + oy) / 2, (sz + oz) / 2])) outside++;
    });
  }
  expect(outside).toBe(0);
});
