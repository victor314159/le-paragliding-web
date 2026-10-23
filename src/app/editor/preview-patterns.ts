import type { DesignForm } from './editor-draft';
import { finite, pointPath, type Point } from './preview-geometry';

type Colors = DesignForm['extradosColors'];
type Rib = DesignForm['geometry']['ribs'][number];
const validRib = (rib: Rib | undefined): rib is Rib & { x: number; yLE: number; yTE: number } =>
  !!rib && finite(rib.x) && finite(rib.yLE) && finite(rib.yTE);
const percent = (value: unknown): value is number => finite(value) && value >= 0 && value <= 100;

/** Color positions are measured from TE. Panel 1 runs from the symmetry axis to rib 1. */
export function colorPlanform(geometry: DesignForm['geometry'], colors: Colors) {
  const ribs = geometry.ribs;
  const point = (rib: Rib, distance: number): Point => [
    rib.x!,
    rib.yTE! + (distance / 100) * (rib.yLE! - rib.yTE!),
  ];
  const panels = ribs.flatMap((right, index) => {
    const left = index ? ribs[index - 1] : right && { ...right, x: 0 };
    if (!validRib(left) || !validRib(right) || right.x <= left.x) return [];
    const record =
      colors.mode === 'panels' ? colors.panels.findIndex((p) => p.panel === index + 1) : -1;
    const source = record >= 0 ? colors.panels[record].cuts : [];
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
          path: pointPath(
            [
              point(left, borders[i].left),
              point(right, borders[i].right),
              point(right, cut.right),
              point(left, cut.left),
            ],
            true,
          ),
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
        path: pointPath(points, true),
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
export function tensionCurve(
  points:
    | DesignForm['skinTension']['points']
    | DesignForm['skinTensionGroups']['groups'][number]['points'],
  surface: TensionSurface,
) {
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
