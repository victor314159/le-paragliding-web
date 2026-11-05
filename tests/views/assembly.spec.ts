import { expect, test } from '@playwright/test';
import {
  hStraps,
  miniribPatterns,
  miniribSeams,
  ribPatterns,
  skinPanels,
  vRibPatterns,
  vRibs,
  type Point3,
} from '@lepara/geometry/enhanced-v1';
import { SEAM_CONVENTIONS } from '@lepara/design';
import { assembly, matched } from '../../packages/views/src/index.ts';
import { DESIGNS, project } from '../format/helpers';
import { oracleCases } from '../geometry/helpers';

// One design by default: every one with ORACLE_ALL=1.
const designs = oracleCases(
  DESIGNS.map((name) => ({ name })),
  ['swoop2'],
).map(({ name }) => name);

/** The V-ribs each design has going through each other: Swoop2's section 12 anchors both in cell 25. */
const CROSSED: Readonly<Record<string, readonly string[]>> = {
  swoop2: ['24: V-rib 103 through V-rib 106'],
};

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
/**
 * The rigid move, turned over or not, of `points` of the table onto the closed line `pattern`,
 * by the ends of `frame`, those of the same points on it.
 */
function onPattern(points: readonly Flat[], pattern: readonly Flat[], frame = pattern) {
  const [c, d] = farthest(frame);
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
/** A strap or V-rib's lines: of type 5, its teeth, the edge it is cut along, then the feet's seam. */
function stripOutline(strip: ReturnType<typeof vRibPatterns>[number]) {
  if (strip.type !== 5) return strip;
  const count = strip.sewing.length >> 1;
  const teeth = strip.cut.slice(2).find(({ length }) => length !== count + 2)!;
  const [start] = teeth;
  const fromLeft = Math.hypot(start[0] - strip.sewing[0][0], start[1] - strip.sewing[0][1]) < 1e-9;
  const [left, right] = [strip.sewing.slice(0, count), strip.sewing.slice(count)];
  const edge = fromLeft ? right : [...left].reverse();
  const feet = fromLeft ? left : [...right].reverse();
  return { ...strip, sewing: [...teeth, ...edge, ...feet], frame: [...edge, ...feet] };
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
      const ownStripsD: { sewing: readonly Flat[]; frame?: readonly Flat[] }[] = [
        ribs[Math.max(cell - 1, 0)],
        ...(minirib ? [minirib] : []),
        ...strips.filter(({ ribs: on }) => Math.min(...on) === cell).map(stripOutline),
        ribs[cell],
      ];
      expect(model.fills).toHaveLength(ownStripsD.length);
      model.fills.forEach((fill, r) => {
        const piece = ownStripsD[r];
        const { sewing } = piece;
        const ring = flat(fill.opening!.flat[0]);
        const move = onPattern(ring, sewing, piece.frame);
        ring.forEach((p, i) => {
          const q = move(p);
          // Type 5's feet stop at their seam: on its lines, not point for point.
          gaps.push(
            ring.length === sewing.length
              ? Math.hypot(q[0] - sewing[i][0], q[1] - sewing[i][1])
              : toRing(q, sewing),
          );
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
      const ownStrips = strips.filter(({ ribs }) => Math.min(...ribs) === cell);
      // Type 5 is sewn along one edge, and by its feet along the other.
      const feet = found.filter(({ seam }) => seam.includes(' foot ')).length;
      const edges = 2 * ownStrips.length - ownStrips.filter(({ type }) => type === 5).length + feet;
      const through = found.filter(({ seam }) => seam.includes(' through ')).length;
      expect(found).toHaveLength(2 * own.length + shaping + tail + miniribs + edges + through);
      return found;
    });
    const [crossed, sewing] = [true, false].map((through) =>
      checks.filter(({ seam }) => seam.includes(' through ') === through),
    );
    expect(crossed.map(({ cell, seam }) => `${cell}: ${seam}`)).toEqual(CROSSED[id] ?? []);
    expect(worst(sewing.map(({ difference }) => Math.abs(difference)))).toBeLessThan(
      SEAM_CONVENTIONS.seamTolerance,
    );
    const [strips3D, sewn] = [true, false].map((strip) =>
      checks.filter(({ seam }) => seam.startsWith('V-rib') === strip),
    );
    // Laid by its fabric's length, a mark comes under a millimetre from the rib's.
    expect(worst(sewn.map(({ marks }) => marks))).toBeLessThan(0.1);
    // Those of a strap or V-rib too.
    expect(worst(strips3D.map(({ marks }) => marks))).toBeLessThan(0.15);
  });

test('BHL7-22: a strap comes the way it is cut, its corners and lengths the same either way', () => {
  const { design, airfoils } = project('oracle/designs/BHL7-22');
  const strips = hStraps(design, airfoils);
  const patterns = vRibPatterns(design, airfoils);
  expect(strips).toHaveLength(3);
  strips.forEach(({ edges }, i) => {
    const count = patterns[i].sewing.length >> 1;
    const left = patterns[i].sewing.slice(0, count);
    const right = patterns[i].sewing.slice(count).reverse();
    const [sewn] = matched(left, right, edges);
    // Bent at its anchor: its fabric is shorter on one side.
    const step = (a: readonly number[], b: readonly number[]) =>
      Math.hypot(...a.map((v, axis) => v - b[axis]));
    expect(step(sewn[0], sewn[1])).toBeCloseTo(step(left[0], left[1]), 1);
    expect(step(sewn.at(-2)!, sewn.at(-1)!)).toBeCloseTo(step(left.at(-2)!, left.at(-1)!), 1);
  });
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

/** How far a point lies from each rib of a model, outer last. */
function ribPlanes({ fills }: ReturnType<ReturnType<typeof assembly>['model']>) {
  return [fills[0], fills[fills.length - 1]].map(({ points }) => {
    const [o, a, b] = [0, points.length >> 2, (points.length * 3) >> 3].map((i) => points[i]);
    const [u, v] = [a, b].map((p) => p.map((value, axis) => value - o[axis]));
    const normal = [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ];
    const length = Math.hypot(...normal);
    return (p: Point3) =>
      Math.abs(p.reduce((sum, value, axis) => sum + (value - o[axis]) * normal[axis], 0)) / length;
  });
}

for (const id of designs)
  test(`${id}: a strap or V-rib's allowances lie flat, a few layers off its ribs`, () => {
    const { design, airfoils } = project(`oracle/designs/${id}`);
    const pieces = assembly(design, airfoils);
    const model = pieces.model(pieces.cells[pieces.cells.length >> 1], new Set(['rib', 'vrib']));
    const planes = ribPlanes(model);
    const flat = model.fills.slice(1, -1).map(({ color }) => color);
    const flaps = model.surfaces.filter((s) => s.kind === 'flap' && flat.includes(s.color));
    const off = flaps.flatMap(({ rows }) =>
      rows.flat().map((p) => Math.min(...planes.map((plane) => plane(p)))),
    );
    expect(worst(off)).toBeLessThan(0.35);
  });

test("a strap's allowance nests in the panel's corner, past its allowance on the rib", () => {
  // Its straps run along the ribs' contour, and it has no other V-rib.
  const { design, airfoils } = project('oracle/designs/gnu-test-3.19');
  const pieces = assembly(design, airfoils);
  const cell = pieces.cells.find((c) => pieces.model(c, new Set(['vrib'])).fills.length)!;
  const model = pieces.model(cell, new Set(['rib', 'vrib', 'extrados', 'intrados']));
  const planes = ribPlanes(model);
  const colors = new Set(model.fills.map(({ color }) => color));
  const flapsOf = (strap: boolean) =>
    model.surfaces.filter((s) => s.kind === 'flap' && colors.has(s.color) === strap);
  const straps = flapsOf(true).filter(({ color }) => color !== model.fills[0].color);
  expect(straps.length).toBeGreaterThan(0);
  const side = (row: readonly Point3[]) => {
    const middle = row[row.length >> 1];
    return planes[0](middle) < planes[1](middle) ? 0 : 1;
  };
  const off = (row: readonly Point3[]) => planes[side(row)](row[row.length >> 1]);
  for (const r of [0, 1]) {
    const panels = flapsOf(false).filter(
      ({ rows }) => side(rows[1]) === r && off(rows[1]) < 0.5 && rows[0].length > 20,
    );
    const own = straps.filter(({ rows }) => side(rows[1]) === r);
    expect(panels.length).toBeGreaterThan(0);
    expect(own.length).toBeGreaterThan(0);
    expect(Math.min(...own.map(({ rows }) => off(rows[1])))).toBeGreaterThan(
      Math.max(...panels.map(({ rows }) => off(rows[1]))),
    );
  }
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

test('a V-rib off its line or longer than its pattern shows on that seam, and only there', () => {
  const { design, airfoils } = project('oracle/designs/swoop2');
  const strips = [...hStraps(design, airfoils), ...vRibs(design, airfoils)];
  const target = strips.find((strip) => 'type' in strip && strip.type === 6)!;
  const cell = Math.min(...target.ribs);
  const changed = (edge: (points: readonly Point3[]) => Point3[]) =>
    assembly(
      design,
      airfoils,
      undefined,
      strips.map((strip) =>
        strip === target
          ? { ...strip, edges: [edge(strip.edges[0]), strip.edges[1]] as const }
          : strip,
      ),
    ).checks(cell);
  const off = (checks: ReturnType<typeof changed>) =>
    checks.filter(
      ({ difference, marks }) =>
        Math.abs(difference) > SEAM_CONVENTIONS.seamTolerance ||
        marks > SEAM_CONVENTIONS.seamTolerance,
    );
  // Slid 1 cm along the chord, its edge keeps its length, and leaves where it is sewn.
  const slid = off(changed((points) => points.map(([x, y, z]): Point3 => [x, y + 1, z])));
  expect(slid).toHaveLength(1);
  expect(slid[0].seam).toMatch(/^V-rib /);
  expect(slid[0].marks).toBeGreaterThan(SEAM_CONVENTIONS.seamTolerance);
  // Stretched 1 cm past its far end, it no longer has the length of its pattern.
  const stretched = off(
    changed((points) => {
      const [a, b] = [points[points.length - 2], points[points.length - 1]];
      const [dx, dy, dz] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const length = Math.hypot(dx, dy, dz);
      return [...points.slice(0, -1), [b[0] + dx / length, b[1] + dy / length, b[2] + dz / length]];
    }),
  );
  expect(stretched).toHaveLength(1);
  expect(Math.abs(stretched[0].difference)).toBeGreaterThan(0.9);
  expect(off(assembly(design, airfoils).checks(cell))).toEqual([]);
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

test("a V-rib's edges fold on its allowances, and points inside it shape it", () => {
  const { design, airfoils } = project('oracle/designs/A8');
  const pieces = assembly(design, airfoils);
  const model = pieces.model(15, new Set(['vrib']));
  const body = model.fills[0];
  const gap = (p: Point3) =>
    Math.min(...body.points.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])));
  const seams = model.surfaces.filter(({ kind }) => kind === 'flap').flatMap(({ rows }) => rows[0]);
  // Its edge along the rib, and its four feet.
  expect(model.surfaces.filter(({ kind }) => kind === 'flap')).toHaveLength(5);
  expect(worst(seams.map(gap))).toBeLessThan(1e-9);
  expect(body.holes!.filter((ring) => ring.length === 1).length).toBeGreaterThan(50);
});

test('each foot of a type 5 V-rib is checked on an anchor of its rib', () => {
  const { design, airfoils } = project('oracle/designs/A8');
  const feet = assembly(design, airfoils)
    .checks(15)
    .filter(({ seam }) => seam.includes(' foot '));
  expect(feet.map(({ seam }) => seam)).toEqual(
    [1, 2, 3, 4].map((foot) => `V-rib 41 foot ${foot} on rib 16`),
  );
  expect(worst(feet.map(({ marks }) => marks))).toBeLessThan(0.2);
  expect(worst(feet.map(({ difference }) => Math.abs(difference)))).toBeLessThan(0.2);
});

test("a panel's stretch comes from the overwidth that balloons its cell", () => {
  const { design, airfoils } = project('oracle/designs/A8');
  const { skinTensionGroups: groups } = design;
  if (groups.mode !== 1) throw new Error('A8 has its overwidth in section 31');
  const biggest = (source: typeof design) => {
    const pieces = assembly(source, airfoils);
    return worst(pieces.cells.flatMap((cell) => pieces.stretches(cell).map((s) => s.stretch)));
  };
  const flattened = {
    ...design,
    skinTensionGroups: {
      ...groups,
      groups: groups.groups.map((group) => ({
        ...group,
        points: group.points.map((point) => ({
          ...point,
          extradosOverwidth: 0,
          intradosOverwidth: 0,
        })),
      })),
    },
  };
  expect(assembly(design, airfoils).overwidthSection).toBe(31);
  // The extrados gathers it at the nose.
  const [{ stretch, nose }] = assembly(design, airfoils).stretches(8);
  expect(nose).toBeGreaterThan(2 * stretch);
  expect(biggest(design)).toBeGreaterThan(0.02);
  expect(biggest(flattened)).toBeLessThan(0.01);
});
