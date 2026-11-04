import { expect, test } from '@playwright/test';
import {
  miniribPatterns,
  miniribSeams,
  ribPatterns,
  skinPanels,
  vRibPatterns,
  type Point3,
} from '@lepara/geometry/enhanced-v1';
import { SEAM_CONVENTIONS } from '@lepara/design';
import { assembly } from '../../packages/views/src/index.ts';
import { DESIGNS, project } from '../format/helpers';
import { oracleCases } from '../geometry/helpers';

// One design by default: every one with ORACLE_ALL=1.
const designs = oracleCases(
  DESIGNS.map((name) => ({ name })),
  ['swoop2'],
).map(({ name }) => name);

type Flat = readonly [number, number];
const worst = (values: readonly number[]) => values.reduce((a, b) => Math.max(a, b), 0);
const toSegment = (p: Flat, a: Flat, b: Flat) => {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
const toRing = (p: Flat, ring: readonly Flat[]) =>
  Math.min(...ring.map((a, i) => toSegment(p, a, ring[(i + 1) % ring.length])));
const flat = (points: readonly Point3[]) => points.map(([x, y]): Flat => [x, y]);
function farthest(points: readonly Flat[]) {
  let pair: [Flat, Flat] = [points[0], points[0]];
  let most = 0;
  for (const p of points)
    for (const q of points) {
      const length = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (length > most) [most, pair] = [length, [p, q]];
    }
  return pair;
}
/** The rigid move, turned over or not, of `points` of the table onto the closed line `pattern`. */
function onPattern(points: readonly Flat[], pattern: readonly Flat[]) {
  const [c, d] = farthest(pattern);
  const f = Math.atan2(d[1] - c[1], d[0] - c[0]);
  const [a, b] = farthest(points);
  const moves = [
    [a, b],
    [b, a],
  ].flatMap(([p, q]) =>
    [1, -1].map((side) => {
      const e = Math.atan2(q[1] - p[1], q[0] - p[0]);
      return ([x, y]: Flat): Flat => {
        const [along, off] = [
          (x - p[0]) * Math.cos(e) + (y - p[1]) * Math.sin(e),
          side * ((y - p[1]) * Math.cos(e) - (x - p[0]) * Math.sin(e)),
        ];
        return [
          c[0] + along * Math.cos(f) - off * Math.sin(f),
          c[1] + along * Math.sin(f) + off * Math.cos(f),
        ];
      };
    }),
  );
  const miss = (move: (typeof moves)[number]) => worst(points.map((p) => toRing(move(p), pattern)));
  return moves.reduce((best, move) => (miss(move) < miss(best) ? move : best));
}
const finite = (rings: readonly (readonly Point3[])[]) =>
  rings.every((ring) => ring.every((p) => p.every(Number.isFinite)));

for (const id of designs)
  test(`${id}: laid flat, every piece of a cell is its pattern, moved rigidly`, () => {
    const { design, airfoils } = project(`oracle/designs/${id}`);
    const pieces = assembly(design, airfoils);
    expect(pieces.cells.length).toBeGreaterThan(0);
    const panels = skinPanels(design, airfoils);
    const ribs = ribPatterns(design, airfoils);
    const miniribs = miniribPatterns(design, airfoils);
    const strips = vRibPatterns(design, airfoils);
    const gaps: number[] = [];
    let unfinite = 0;
    for (const cell of pieces.cells) {
      const model = pieces.model(cell);
      const own = panels.filter((panel) => panel.cell === cell);
      const skins = model.surfaces.filter((s) => s.kind === 'skin');
      expect(skins).toHaveLength(own.length);
      const table = new Set(
        [...model.surfaces, ...model.fills].flatMap((s) => s.opening!.flat.flat()).map((p) => p[2]),
      );
      expect(table.size).toBe(1);
      skins.forEach((surface, i) => {
        const panel = own[i];
        const { flat: laid, apart } = surface.opening!;
        if (!finite(surface.rows) || !finite(apart) || !finite(laid)) unfinite++;
        // Its edges and corners on the sewing line, and the sewing line on them.
        const edge = flat([
          ...laid[0],
          ...laid[laid.length - 1],
          ...laid.map((row) => row[0]),
          ...laid.map((row) => row[row.length - 1]),
        ]);
        const outline = edge.map(onPattern(edge, panel.sewing));
        gaps.push(...outline.map((p) => toRing(p, panel.sewing)));
        for (const p of panel.sewing)
          gaps.push(Math.min(...outline.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1]))));
      });
      for (const { rows, kind, opening } of model.surfaces)
        if (kind === 'flap' && (!finite(rows) || !finite(opening!.apart) || !finite(opening!.flat)))
          unfinite++;
      const minirib = miniribs.find(({ rib }) => rib - 1 === cell);
      const own2D = [
        ribs[Math.max(cell - 1, 0)],
        ...(minirib ? [minirib] : []),
        ...strips.filter(({ ribs: on, type }) => type !== 5 && Math.min(...on) === cell),
        ribs[cell],
      ];
      expect(model.fills).toHaveLength(own2D.length);
      model.fills.forEach((fill, r) => {
        const { sewing } = own2D[r];
        const ring = flat(fill.opening!.flat[0]);
        const move = onPattern(ring, sewing);
        ring.forEach((p, i) => {
          const q = move(p);
          gaps.push(Math.hypot(q[0] - sewing[i][0], q[1] - sewing[i][1]));
        });
      });
    }
    expect(unfinite).toBe(0);
    expect(worst(gaps)).toBeLessThan(1e-6);
  });

for (const id of designs)
  test(`${id}: the cut lines close around each panel, as cut`, () => {
    const { design, airfoils } = project(`oracle/designs/${id}`);
    const pieces = assembly(design, airfoils);
    const panels = skinPanels(design, airfoils);
    const cell = pieces.cells[pieces.cells.length >> 1];
    const model = pieces.model(cell);
    const own = panels.filter((panel) => panel.cell === cell);
    // The panels' allowances, in fours: the ribs' and miniribs' have their colors.
    const flatColors = new Set(model.fills.map((fill) => fill.color));
    const flaps = model.surfaces.filter((s) => s.kind === 'flap' && !flatColors.has(s.color));
    const gaps: number[] = [];
    own.forEach((panel, i) => {
      const rows = flaps.slice(i * 4, i * 4 + 4).map((flap) => flat(flap.opening!.flat[1]));
      expect(rows).toHaveLength(4);
      const moved = rows.flat();
      const move = onPattern(moved, panel.cut);
      gaps.push(...moved.map((p) => toRing(move(p), panel.cut)));
      for (const p of panel.cut)
        gaps.push(
          Math.min(
            ...moved.map((q) => {
              const r = move(q);
              return Math.hypot(p[0] - r[0], p[1] - r[1]);
            }),
          ),
        );
    });
    expect(worst(gaps)).toBeLessThan(1e-6);
  });

for (const id of designs)
  test(`${id}: every seam sews together`, () => {
    const { design, airfoils } = project(`oracle/designs/${id}`);
    const pieces = assembly(design, airfoils);
    const all = skinPanels(design, airfoils);
    const seams = miniribSeams(design, airfoils);
    const strips = vRibPatterns(design, airfoils);
    const checks = pieces.cells.flatMap((cell) => {
      const own = all.filter((panel) => panel.cell === cell);
      const found = pieces.checks(cell);
      const shaping = own.filter((panel) => panel.piece > 0).length;
      const tail = new Set(own.map((panel) => panel.surface)).size > 1 ? 1 : 0;
      const miniribs = seams.filter((seam) => seam.cell === cell).length;
      const edges =
        2 * strips.filter(({ ribs, type }) => type !== 5 && Math.min(...ribs) === cell).length;
      expect(found).toHaveLength(2 * own.length + shaping + tail + miniribs + edges);
      return found;
    });
    expect(worst(checks.map(({ difference }) => Math.abs(difference)))).toBeLessThan(
      SEAM_CONVENTIONS.seamTolerance,
    );
    // Laid by its fabric's length, a mark comes under a millimetre from the rib's.
    expect(worst(checks.map(({ marks }) => marks))).toBeLessThan(0.1);
  });

for (const id of designs)
  test(`${id}: pieces lie lengthwise in columns, ordered as on the wing, trailing edges level`, () => {
    const { design, airfoils } = project(`oracle/designs/${id}`);
    const pieces = assembly(design, airfoils);
    const model = pieces.model(pieces.cells[pieces.cells.length >> 1]);
    const boxes = (items: readonly { opening?: { flat: Point3[][] } }[]) =>
      items.map(({ opening }) => {
        const points = flat(opening!.flat.flat());
        const [xs, ys] = [points.map((p) => p[0]), points.map((p) => p[1])];
        return {
          x: (Math.min(...xs) + Math.max(...xs)) / 2,
          wide: Math.max(...xs) - Math.min(...xs),
          long: Math.max(...ys) - Math.min(...ys),
          tail: Math.max(...ys),
        };
      });
    const skins = boxes(model.surfaces.filter((s) => s.kind === 'skin'));
    const fills = boxes(model.fills.filter(({ color }) => color === model.fills[0].color));
    // A short piece of a 3D-shaping cut can be wider than long: it runs lengthwise all the same.
    expect(fills.every(({ wide, long }) => long > wide)).toBe(true);
    const [inner, outer] = [fills[0], fills[fills.length - 1]];
    const xs = skins.map(({ x }) => x);
    expect(inner.x).toBeLessThan(Math.min(...xs));
    expect(outer.x).toBeGreaterThan(Math.max(...xs));
    // Allowances past the sewing lines: a skin's leads the rest by its own.
    const tails = [...fills, ...skins.slice(0, 1)].map(({ tail }) => tail);
    expect(Math.max(...tails) - Math.min(...tails)).toBeLessThan(5);
  });

test('the table has a grid around the pieces laid flat', () => {
  const { design, airfoils } = project('oracle/designs/swoop2');
  const pieces = assembly(design, airfoils);
  const model = pieces.model(pieces.cells[0]);
  const { length, lines } = model.grid!;
  const laid = model.lines.flatMap((line) => line.opening!.flat);
  const [xs, ys] = [lines.map((p) => p[0]), lines.map((p) => p[1])];
  const inside = ([x, y]: Point3) =>
    x >= Math.min(...xs) && x <= Math.max(...xs) && y >= Math.min(...ys) && y <= Math.max(...ys);
  expect(lines.length % 2).toBe(0);
  expect(laid.every(inside)).toBe(true);
  expect(worst(xs.map((x) => Math.abs(x / length - Math.round(x / length))))).toBeLessThan(1e-9);
});

for (const id of designs)
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
    const steps = items.flatMap(({ opening }) => [
      ...opening!.before,
      opening!.apart,
      ...opening!.between,
      opening!.flat,
    ]);
    expect(worst(steps.map(lowest))).toBeLessThan(table + 0.2);
  });

test("a minirib's allowance lies flat on the skin, its seam marked on the panels", () => {
  const { design, airfoils } = project('oracle/designs/swoop2');
  const pieces = assembly(design, airfoils);
  const cell = pieces.cells[pieces.cells.length >> 1];
  const model = pieces.model(cell, new Set(['minirib', 'extrados', 'intrados', 'lines']));
  const [{ color }] = model.fills;
  const flaps = model.surfaces.filter((s) => s.kind === 'flap' && s.color === color);
  expect(flaps).toHaveLength(2);
  // Square to the minirib.
  const [o, a, b] = model.fills[0].points;
  const [u, v] = [a, b].map((p) => p.map((value, axis) => value - o[axis]));
  const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  for (const { rows } of flaps) {
    const [p, q] = [rows[0][rows[0].length >> 1], rows[1][rows[1].length >> 1]];
    const width = Math.hypot(...p.map((v, a) => v - q[a]));
    const across = p.reduce((sum, value, axis) => sum + (value - q[axis]) * normal[axis], 0);
    expect(Math.abs(across) / (width * Math.hypot(...normal))).toBeGreaterThan(0.9);
  }
  expect(model.lines.filter((line) => line.color)).toHaveLength(2);
});

for (const id of designs)
  test(`${id}: the skins meet a minirib all along its seams`, () => {
    const { design, airfoils } = project(`oracle/designs/${id}`);
    const pieces = assembly(design, airfoils);
    const model = pieces.model(
      pieces.cells[pieces.cells.length >> 1],
      new Set(['extrados', 'intrados', 'minirib']),
    );
    const edges = model.surfaces
      .filter((s) => s.kind === 'skin')
      .flatMap(({ rows }) => [
        ...rows.flatMap((row) => row.slice(1).map((p, i) => [row[i], p] as const)),
        ...rows.slice(1).flatMap((row, r) => row.map((p, j) => [rows[r][j], p] as const)),
      ]);
    const onSegment = (p: Point3, a: Point3, b: Point3) => {
      const d = b.map((v, axis) => v - a[axis]);
      const l = d.reduce((sum, v) => sum + v * v, 0) || 1;
      const t = Math.max(
        0,
        Math.min(1, p.reduce((sum, v, axis) => sum + (v - a[axis]) * d[axis], 0) / l),
      );
      return Math.hypot(...p.map((v, axis) => v - a[axis] - t * d[axis]));
    };
    // A single skin has none.
    const gaps = (model.fills[0]?.points ?? []).map((p) =>
      Math.min(...edges.map(([a, b]) => onSegment(p, a, b))),
    );
    expect(worst(gaps)).toBeLessThan(0.4);
  });

for (const id of designs)
  test(`${id}: a strap or V-rib's allowances lie a layer off its ribs`, () => {
    const { design, airfoils } = project(`oracle/designs/${id}`);
    const pieces = assembly(design, airfoils);
    const model = pieces.model(pieces.cells[pieces.cells.length >> 1], new Set(['rib', 'vrib']));
    const [inner, outer] = [model.fills[0], model.fills[model.fills.length - 1]];
    const flat = model.fills.slice(1, -1).map(({ color }) => color);
    const flaps = model.surfaces.filter((s) => s.kind === 'flap' && flat.includes(s.color));
    const planes = [inner, outer].map(({ points }) => {
      const [o, a, b] = [0, points.length >> 2, (points.length * 3) >> 3].map((i) => points[i]);
      const [u, v] = [a, b].map((p) => p.map((value, axis) => value - o[axis]));
      const normal = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
      ];
      const length = Math.hypot(...normal);
      return (p: Point3) =>
        Math.abs(p.reduce((sum, value, axis) => sum + (value - o[axis]) * normal[axis], 0)) /
        length;
    });
    const off = flaps.flatMap(({ rows }) =>
      rows.flat().map((p) => Math.min(...planes.map((plane) => plane(p)))),
    );
    expect(worst(off)).toBeLessThan(0.15);
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
  expect(ribs.fills).toHaveLength(2);
  const miniribs = pieces.model(cell, new Set(['minirib'])).fills;
  const strips = pieces.model(cell, new Set(['vrib'])).fills;
  expect(miniribs.length + strips.length).toBe(all.fills.length - 2);
  expect(ribs.surfaces.every((surface) => surface.kind === 'flap')).toBe(true);
  const kinds = pieces.model(cell, new Set(['extrados'])).surfaces.map((surface) => surface.kind);
  expect(new Set(kinds)).toEqual(new Set(['skin', 'flap']));
  expect(pieces.model(cell, new Set(['marks'])).dots).toHaveLength(all.dots.length);
  // Without lines, not one: neither folds, nor cut lines, holes or seams.
  const { lines, surfaces } = pieces.model(cell, new Set(['extrados', 'rib', 'minirib']));
  expect(lines).toEqual([]);
  expect(surfaces.length).toBeGreaterThan(0);
  expect(pieces.model(cell, new Set(['lines'])).lines.length).toBeGreaterThan(0);
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
  // In its own color, the miniribs' seams having theirs.
  const colors = (panels?: typeof wrong) =>
    new Set(
      assembly(design, airfoils, panels)
        .model(cell)
        .lines.map((line) => line.color),
    );
  expect(colors(wrong).size).toBe(colors().size + 1);
});

for (const id of designs)
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
    const openings = [...model.surfaces, ...model.fills].map((item) => item.opening!);
    expect(Math.min(...openings.map(({ between }) => between.length))).toBeGreaterThan(2);
    const moved = openings.flatMap(({ between, flat: laid }) =>
      between.flatMap((pose) =>
        pose.flatMap((ring, r) => {
          const wanted = span(laid[r]);
          return span(ring).map((d, i) => Math.abs(d - wanted[i]));
        }),
      ),
    );
    expect(worst(moved)).toBeLessThan(1e-6);
    const { before, between } = model.fills[0].opening!;
    expect(model.openingAt).toHaveLength(before.length + 2 + between.length);
  });

for (const id of designs)
  test(`${id}: allowances swing open about their seams, on an arc, once apart`, () => {
    const { design, airfoils } = project(`oracle/designs/${id}`);
    const pieces = assembly(design, airfoils);
    const model = pieces.model(pieces.cells[pieces.cells.length >> 1]);
    const reach = (rows: readonly (readonly Point3[])[]) =>
      rows[0].map((p, i) => Math.hypot(...p.map((v, a) => v - rows[1][i][a])));
    const faults: number[] = [];
    for (const { rows, kind, opening } of model.surfaces) {
      if (kind !== 'flap') continue;
      const [sewn, open] = [reach(rows), reach(opening!.apart)];
      // The piece moves apart folded, as sewn.
      faults.push(...reach(opening!.before[0]).map((length, i) => Math.abs(length - sewn[i])));
      opening!.before.forEach((step) => {
        // The seam stays put, and each point keeps its distance from it.
        expect(step[0]).toEqual(opening!.before[0][0]);
        faults.push(
          ...reach(step).map((length, i) =>
            Math.max(Math.min(sewn[i], open[i]) - length, length - Math.max(sewn[i], open[i])),
          ),
        );
      });
    }
    expect(worst(faults)).toBeLessThan(1e-6);
  });

for (const id of designs)
  test(`${id}: an allowance opens as wide as it is cut, its corners off to the side`, () => {
    const { design, airfoils } = project(`oracle/designs/${id}`);
    const pieces = assembly(design, airfoils);
    const model = pieces.model(pieces.cells[pieces.cells.length >> 1]);
    const width = (line: readonly (readonly Point3[])[]) =>
      line[1].map((p, i) => Math.hypot(...p.map((v, a) => v - line[0][i][a])));
    const flaps = model.surfaces.filter(({ kind }) => kind === 'flap');
    expect(flaps.every(({ rows }) => rows.length === 2)).toBe(true);
    const differences = flaps.flatMap(({ opening }) => {
      const laid = width(opening!.flat);
      return width(opening!.apart).map((value, i) => Math.abs(value - laid[i]));
    });
    expect(worst(differences)).toBeLessThan(0.15);
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
