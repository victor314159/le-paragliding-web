import type { GeometryResult, PreprocessorInput } from '@lepara/preprocessor';
import { flipX, mirrored, previewBounds, type Point } from './geometry.ts';
import { PreviewDrawing, metricsNote } from './scene.ts';

/** A parameter group of pre-data.txt, highlighted in its scene. */
export type PreprocessorFocus =
  | { readonly part: 'span' }
  | { readonly part: 'cells'; readonly cell?: number }
  | { readonly part: 'leadingEdge'; readonly correction?: 1 | 2 }
  | { readonly part: 'trailingEdge'; readonly correction?: 1 }
  | { readonly part: 'vault'; readonly arc?: number };

const mirror = (points: readonly Point[]) => mirrored(points, flipX);

/** Both halves of a half-wing contour, apart: joining them would draw across the center. */
const halves = (points: readonly Point[]): Point[][] => [points.map(flipX), [...points]];

/** The nearest contour point to `x`. */
const at = (points: readonly Point[], x: number): Point =>
  points.reduce((a, b) => (Math.abs(a[0] - x) < Math.abs(b[0] - x) ? a : b));

/** A drawing in model coordinates; `highlights` and `cells` show the focused parameters. */
interface Parts {
  readonly curves: { points: readonly Point[]; label: string }[];
  readonly ribs: Point[][];
  readonly markers: { point: Point; label: string; selected?: boolean }[];
  readonly highlights: Point[][];
  readonly cells: Point[][];
  selection?: string;
}

const parts = (): Parts => ({ curves: [], ribs: [], markers: [], highlights: [], cells: [] });

/** The cells of the half wing, from the center: a central cell spans both sides. */
const cellsOf = (result: GeometryResult) =>
  result.ribs.flatMap((rib, i) => {
    const left = i === 0 ? { ...rib, x: -rib.x } : result.ribs[i - 1];
    return rib.x > left.x ? [{ left, right: rib, width: rib.x - left.x }] : [];
  });

const cellLabel = (result: GeometryResult, cells: ReturnType<typeof cellsOf>, i: number) =>
  `${i === 0 && result.cells % 2 ? 'Central cell' : 'Cell ' + (i + 1)} · ${cells[i].width.toFixed(2)} cm`;

const focusedCell = (focus: PreprocessorFocus | undefined) =>
  focus?.part === 'cells' ? focus.cell : undefined;

function planform(
  result: GeometryResult,
  input: PreprocessorInput,
  focus: PreprocessorFocus | undefined,
): Parts {
  const s = parts();
  const { leadingEdge, trailingEdge } = result.curves;
  s.curves.push(
    { points: mirror(leadingEdge), label: 'Leading edge' },
    { points: mirror(trailingEdge), label: 'Trailing edge' },
  );
  for (const rib of result.ribs)
    for (const sign of [-1, 1])
      s.ribs.push([
        [rib.x * sign, rib.yLE],
        [rib.x * sign, rib.yTE],
      ]);
  const starts = [
    [leadingEdge, input.leadingEdge.x1, 'Leading edge correction 1', 'leadingEdge', 1],
    [leadingEdge, input.leadingEdge.x2, 'Leading edge correction 2', 'leadingEdge', 2],
    [trailingEdge, input.trailingEdge.x1, 'Trailing edge correction', 'trailingEdge', 1],
  ] as const;
  for (const [points, x, label, part, correction] of starts) {
    const start = at(points, x);
    const selected = focus?.part === part && focus.correction === correction;
    s.markers.push({ point: start, label: `${label} starts at ${x} cm`, selected });
    if (selected) {
      s.highlights.push(...halves(points.slice(points.indexOf(start))));
      s.selection = label;
    }
  }
  if (focus?.part === 'span') {
    s.highlights.push(...halves(leadingEdge), ...halves(trailingEdge));
    s.selection = 'Flat half span';
  } else if (
    (focus?.part === 'leadingEdge' || focus?.part === 'trailingEdge') &&
    focus.correction === undefined
  ) {
    const leading = focus.part === 'leadingEdge';
    s.highlights.push(...halves(leading ? leadingEdge : trailingEdge));
    s.selection = leading ? 'Leading edge' : 'Trailing edge';
  }
  const cells = cellsOf(result);
  const active = focusedCell(focus);
  if (active !== undefined && cells[active]) {
    const { left, right } = cells[active];
    const outline: Point[] = [
      [left.x, left.yLE],
      [right.x, right.yLE],
      [right.x, right.yTE],
      [left.x, left.yTE],
    ];
    // A central cell already spans both sides.
    s.cells.push(...(left.x < 0 ? [outline] : halves(outline)));
    s.selection = cellLabel(result, cells, active);
  }
  return s;
}

function front(result: GeometryResult, focus: PreprocessorFocus | undefined): Parts {
  const s = parts();
  const { vault, vaultArcs } = result.curves;
  s.curves.push({ points: mirror(vault), label: 'Vault' });
  for (const rib of result.ribs)
    s.markers.push({
      point: [rib.xp, rib.z],
      label: `Rib ${rib.number} · Inclination ${rib.beta.toFixed(2)}°`,
    });
  const arc = focus?.part === 'vault' ? focus.arc : undefined;
  // Junction i joins arcs i and i + 1.
  vaultArcs.slice(1).forEach(([point], i) =>
    s.markers.push({
      point,
      label: `Arc junction ${i + 1}`,
      selected: arc === i || arc === i + 1,
    }),
  );
  if (arc !== undefined && vaultArcs[arc]) {
    s.highlights.push(...halves(vaultArcs[arc]));
    s.selection = `Arc ${arc + 1}`;
  } else if (focus?.part === 'vault' || focus?.part === 'span') {
    s.highlights.push(...halves(vault));
    s.selection = focus.part === 'span' ? 'Flat half span' : 'Vault';
  }
  return s;
}

/** A horizontal bar per cell: x is its width in cm, y its index. */
function cellBars(result: GeometryResult, focus: PreprocessorFocus | undefined): Parts {
  const s = parts();
  const cells = cellsOf(result);
  const spacing = Math.max(...cells.map((cell) => cell.width), 1) / cells.length;
  const active = focusedCell(focus);
  cells.forEach((cell, i) => {
    const bar: Point[] = [
      [0, i * spacing],
      [cell.width, i * spacing],
    ];
    s.curves.push({ points: bar, label: cellLabel(result, cells, i) });
    if (i === active) {
      s.highlights.push(bar);
      s.selection = cellLabel(result, cells, i);
    }
  });
  return s;
}

/**
 * The geometry the parameters of pre-data.txt generate, before Wing scale as
 * geometry-out.txt: its planform, vault (`front`) or cell widths (`cells`),
 * the parameter group `focus` highlighted.
 */
export function preprocessorScene(
  result: GeometryResult,
  input: PreprocessorInput,
  view: string,
  focus?: PreprocessorFocus,
) {
  const s =
    view === 'cells'
      ? cellBars(result, focus)
      : view === 'front'
        ? front(result, focus)
        : planform(result, input, focus);
  const d = new PreviewDrawing(
    `Generated ${view === 'front' ? 'vault' : view === 'cells' ? 'half-wing cell widths (cm)' : 'planform'}${
      s.selection ? ` · ${s.selection}` : ''
    }`,
    `${metricsNote(result.metrics, result.cells)} · Before Wing scale, as geometry-out.txt. ` +
      'Focus a parameter group to highlight it.',
  );
  const all = [s.cells, s.ribs, s.curves.map((c) => c.points), s.highlights].flat(2);
  const bounds = previewBounds(all);
  const radius = Math.max(bounds.right - bounds.left, 1) * 0.003;
  for (const cell of s.cells) d.path(cell, 'cell-selection', false, s.selection, true);
  for (const rib of s.ribs) d.path(rib, 'rib');
  for (const curve of s.curves) d.path(curve.points, 'curve', false, curve.label);
  for (const highlight of s.highlights) d.path(highlight, 'highlight', true, s.selection);
  for (const marker of s.markers)
    d.dot(
      marker.point,
      radius * (marker.selected ? 1.5 : 1),
      marker.label,
      marker.selected,
      'point',
    );
  return d.finish();
}
