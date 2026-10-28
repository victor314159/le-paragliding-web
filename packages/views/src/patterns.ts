import type { Colors, Geometry, RibGeometry, SkinTensionPoint } from '@lepara/format';
import { finite, flipX, previewBounds, type Point } from './geometry.ts';
import { PreviewDrawing, type PreviewContext } from './scene.ts';

const validRib = (rib: RibGeometry | undefined): rib is RibGeometry =>
  !!rib && finite(rib.x) && finite(rib.yLE) && finite(rib.yTE);
const percent = (value: unknown): value is number => finite(value) && value >= 0 && value <= 100;

/** Color positions are measured from TE. Panel 1 runs from the symmetry axis to rib 1. */
export function colorPlanform(geometry: Geometry, colors: Colors) {
  const ribs = geometry.ribs;
  const point = (rib: RibGeometry, distance: number): Point => [
    rib.x,
    rib.yTE + (distance / 100) * (rib.yLE - rib.yTE),
  ];
  const rows = colors.mode === 'panels' ? colors.panels : [];
  const panels = ribs.flatMap((right, index) => {
    const left = index ? ribs[index - 1] : right && { ...right, x: 0 };
    if (!validRib(left) || !validRib(right) || right.x <= left.x) return [];
    const record = rows.findIndex((p) => p.panel === index + 1);
    const source = record >= 0 ? rows[record].cuts : [];
    const cuts = source.flatMap((cut, i) =>
      percent(cut.left) && percent(cut.right)
        ? [
            {
              index: i,
              number: cut.number,
              left: cut.left,
              right: cut.right,
              points: [point(left, cut.left), point(right, cut.right)],
            },
          ]
        : [],
    );
    const ordered = [...cuts].sort((a, b) => a.left + a.right - b.left - b.right);
    const crossed = ordered.some(
      (cut, i) => i > 0 && (cut.left < ordered[i - 1].left || cut.right < ordered[i - 1].right),
    );
    const borders = [{ left: 0, right: 0 }, ...ordered, { left: 100, right: 100 }];
    const regions = crossed
      ? []
      : borders.slice(1).map((cut, i) => ({
          points: [
            point(left, borders[i].left),
            point(right, borders[i].right),
            point(right, cut.right),
            point(left, cut.left),
          ],
          from: borders[i],
          to: cut,
          band: i,
        }));
    const points = [point(left, 0), point(right, 0), point(right, 100), point(left, 100)];
    return [
      {
        number: index + 1,
        record,
        cuts,
        regions,
        crossed,
        points,
        omitted: source.length - cuts.length,
      },
    ];
  });
  const marks =
    colors.mode !== 'ribs'
      ? []
      : colors.ribs.flatMap((row, record) => {
          const rib =
            finite(row.rib) && Number.isInteger(row.rib)
              ? row.rib === 0 && ribs[0]
                ? { ...ribs[0], x: 0 }
                : ribs[row.rib - 1]
              : undefined;
          if (!validRib(rib)) return [];
          return row.marks.flatMap((mark, index) =>
            percent(mark.positions[0])
              ? [
                  {
                    record,
                    index,
                    number: mark.number,
                    rib: row.rib,
                    percent: mark.positions[0],
                    point: point(rib, mark.positions[0]),
                  },
                ]
              : [],
          );
        });
  return {
    panels,
    marks,
    omitted:
      colors.mode === 'ribs'
        ? colors.ribs.reduce((sum, r) => sum + r.marks.length, 0) - marks.length
        : colors.panels.reduce(
            (sum, p, record) =>
              sum + (panels.find((panel) => panel.record === record)?.omitted ?? p.cuts.length),
            0,
          ),
  };
}

export type TensionSurface = 'extrados' | 'intrados';
export type TensionView = 'both' | TensionSurface;

/** Put both surfaces on an LE-to-TE axis; retain input order and gaps in incomplete rows. */
export function tensionCurve(points: readonly SkinTensionPoint[], surface: TensionSurface) {
  return points.flatMap((point, index) => {
    const position = point[`${surface}Position`];
    const value = point[`${surface}Overwidth`];
    return percent(position) && finite(value)
      ? [{ index, position, x: surface === 'intrados' ? 100 - position : position, value }]
      : [];
  });
}

/** Four to six useful ticks, including zero, also for zero or negative overwidths. */
export function tensionScale(values: readonly number[]) {
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const target = (max - min || 1) / 4;
  const power = 10 ** Math.floor(Math.log10(target));
  const fraction = target / power;
  const step = power * (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10);
  const low = Math.floor(min / step) * step;
  const high = Math.ceil((max || (min === 0 ? 1 : 0)) / step) * step;
  const ticks = Array.from(
    { length: Math.round((high - low) / step) + 1 },
    (_, i) => low + step * i,
  );
  return { low, high, ticks };
}

/** Sections 15 and 16: the color cuts or rib marks of a surface, on both halves of the planform. */
export function colorsScene(
  { design, selected, active }: PreviewContext<'geometry' | 'extradosColors' | 'intradosColors'>,
  upper: boolean,
) {
  const colors = upper ? design.extradosColors : design.intradosColors;
  const layout = colorPlanform(design.geometry, colors);
  const d = new PreviewDrawing(
    `${upper ? 'Extrados' : 'Intrados'} · color layout`,
    [
      colors.mode === 'panels'
        ? 'Positions from TE · Shading distinguishes regions, not fabric colors. Selected panel and cut highlighted.'
        : 'Marks on ribs, measured from TE · No connections inferred between marks.',
      layout.omitted && `${layout.omitted} incomplete or out-of-range marks/cuts omitted.`,
      layout.panels.some((p) => p.crossed) &&
        'Crossing cuts: only boundaries shown in affected panels.',
    ]
      .filter(Boolean)
      .join(' '),
  );
  const outline = layout.panels.flatMap((p) => p.points);
  const bounds = previewBounds([...outline, ...outline.map(flipX)]);
  const width = bounds.right - bounds.left;
  for (const side of [flipX, (p: Point) => p]) {
    const flip = (points: readonly Point[]) => points.map(side);
    for (const panel of layout.panels) {
      const chosen = panel.record === selected && panel.record >= 0;
      for (const region of panel.regions)
        d.path(flip(region.points), `band-${region.band % 3}`, false, '', true);
      d.path(flip(panel.points), 'panel', chosen, `Panel ${panel.number}`, true);
      for (const cut of panel.cuts)
        d.path(
          flip(cut.points),
          'color-cut',
          chosen && cut.index === active,
          `Panel ${panel.number} · Cut ${cut.number} · ${cut.left}% / ${cut.right}% from TE`,
        );
    }
    for (const mark of layout.marks) {
      const chosen = mark.record === selected && mark.index === active;
      d.dot(
        side(mark.point),
        width * 0.003 * (chosen ? 1.7 : 1),
        `Rib ${mark.rib} · Mark ${mark.number} · ${mark.percent}% from TE`,
        chosen,
        'color-mark',
      );
    }
  }
  const fontSize = width * 0.016;
  const numbers = design.geometry.ribs.flatMap((r, index) =>
    finite(r.x) && finite(r.yLE) && finite(r.yTE)
      ? [{ index, point: [r.x, r.yTE] as Point, direction: [0, r.yTE - r.yLE] as Point }]
      : [],
  );
  d.ribNumbers(numbers, fontSize);
  return d.finish();
}

/** The colors of the surfaces, as in the reinforcement views of section 12. */
export const SURFACE_COLORS: Readonly<Record<TensionSurface, string>> = {
  extrados: '#13899d',
  intrados: '#b38900',
};

/**
 * Sections 5 and 31: the overwidth curves of section 5, or of the group
 * `selected` of section 31, on a chart 640 by 200 units; `view` is a
 * `TensionView`.
 */
export function tensionScene(
  { design, view, selected, active }: PreviewContext<'skinTension' | 'skinTensionGroups'>,
  grouped: boolean,
) {
  const groups = design.skinTensionGroups;
  const group = groups.mode === 1 ? groups.groups[selected] : undefined;
  const title = grouped
    ? `Skin tension · group ${group?.group ?? '—'} · ribs ${group?.firstRib ?? '—'}–${group?.lastRib ?? '—'}`
    : 'Skin tension · section 5';
  const input = grouped ? group?.points : design.skinTension.points;
  if (!input) {
    const d = new PreviewDrawing(title, '');
    d.label(
      [0, 0],
      groups.mode === 0
        ? 'Skin tension groups are disabled; section 5 supplies the base curve.'
        : 'Add a skin tension group to preview its curves.',
    );
    return d.finish();
  }
  const curves = (['extrados', 'intrados'] as const).map((surface) => ({
    surface,
    points: tensionCurve(input, surface),
  }));
  const d = new PreviewDrawing(
    title,
    [
      'Intrados positions converted from TE.',
      !grouped &&
        groups.mode === 1 &&
        'Section 31 is active: its groups replace these overwidths; the engine still uses the extrados position of point 3 for the nose correction (ndif).',
      curves.some((curve) => curve.points.length !== input.length) &&
        'Incomplete or out-of-range points omitted; gaps are not interpolated.',
    ]
      .filter(Boolean)
      .join(' '),
  );
  d.legend.push(
    { text: 'Extrados', color: SURFACE_COLORS.extrados },
    { text: 'Intrados (dashed)', color: SURFACE_COLORS.intrados },
  );
  const width = 640,
    height = 200,
    left = 54,
    right = width - 18,
    top = 25,
    bottom = height - 40,
    font = 12;
  const scale = tensionScale(curves.flatMap((curve) => curve.points.map((p) => p.value)));
  const y = (value: number) =>
    bottom - ((value - scale.low) / (scale.high - scale.low)) * (bottom - top);
  const x = (value: number) => left + (value / 100) * (right - left);
  d.label([8, 15], `Overwidth (${grouped ? '% panel width' : '% chord'})`, 'start', font);
  for (const tick of scale.ticks) {
    d.path(
      [
        [left, y(tick)],
        [right, y(tick)],
      ],
      'tick-grid',
    );
    d.label([left - 8, y(tick) + 4], Number(tick.toPrecision(4)).toString(), 'end', font);
  }
  for (const tick of [0, 25, 50, 75, 100]) {
    d.path(
      [
        [x(tick), top],
        [x(tick), bottom],
      ],
      'tick-grid',
    );
    d.label([x(tick), bottom + 17], String(tick), 'middle', font);
  }
  d.path(
    [
      [left, y(0)],
      [right, y(0)],
    ],
    'zero',
  );
  for (const { surface, points } of curves) {
    if (view !== 'both' && view !== surface) continue;
    const drawn = points.map((p) => ({ ...p, point: [x(p.x), y(p.value)] as Point }));
    // Rows missing between two points leave a gap.
    const path = drawn
      .map((p, i) => `${i && p.index === drawn[i - 1].index + 1 ? 'L' : 'M'}${p.point.join(',')}`)
      .join(' ');
    const color = SURFACE_COLORS[surface];
    d.shape(
      path,
      drawn.map((p) => p.point),
      surface,
      false,
      '',
      color,
    );
    for (const p of drawn)
      d.dot(
        p.point,
        p.index === active ? 5 : 3.5,
        `${surface} · Point ${p.index + 1} · ${p.position}% from ${surface === 'extrados' ? 'LE' : 'TE'} · overwidth ${p.value}%`,
        p.index === active,
        surface,
        color,
      );
  }
  d.label(
    [(left + right) / 2, height - 4],
    `${grouped ? 'Position along panel edge (%)' : 'Position (% chord)'} · LE → TE`,
    'middle',
    font,
  );
  d.frame([
    [0, 0],
    [width, height],
  ]);
  return d.finish();
}
