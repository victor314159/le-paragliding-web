import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import type { GeometryResult, PreprocessorInput } from '@lepara/preprocessor';
import { pointPath, previewBounds, type Point } from '@lepara/views';
import { EditorState, type PreprocessorFocus } from './editor-state';
import { PreviewViewport } from './preview-viewport';

const mirror = (points: readonly Point[]): Point[] => [
  ...[...points].reverse().map(([x, y]): Point => [-x, y]),
  ...points,
];

/** Both halves of a half-wing contour, apart: joining them would draw across the center. */
const halves = (points: readonly Point[]): Point[][] => [
  points.map(([x, y]): Point => [-x, y]),
  [...points],
];

/** The nearest contour point to `x`. */
const at = (points: readonly Point[], x: number): Point =>
  points.reduce((a, b) => (Math.abs(a[0] - x) < Math.abs(b[0] - x) ? a : b));

/** A drawing in model coordinates; `highlights` and `cells` show the focused parameters. */
interface Scene {
  readonly curves: { points: readonly Point[]; label: string }[];
  readonly ribs: Point[][];
  readonly markers: { point: Point; label: string; selected?: boolean }[];
  readonly highlights: Point[][];
  readonly cells: Point[][];
  selection?: string;
}

const scene = (): Scene => ({ curves: [], ribs: [], markers: [], highlights: [], cells: [] });

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
): Scene {
  const s = scene();
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

function front(result: GeometryResult, focus: PreprocessorFocus | undefined): Scene {
  const s = scene();
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
function cellBars(result: GeometryResult, focus: PreprocessorFocus | undefined): Scene {
  const s = scene();
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

/** The geometry the preprocessor's parameters generate: planform, vault or cell widths. */
@Component({
  selector: 'app-preprocessor-preview',
  imports: [DecimalPipe, PreviewViewport],
  template: `
    <figure>
      <figcaption>
        {{
          view() === 'front'
            ? 'Vault'
            : view() === 'cells'
              ? 'Half-wing cell widths (cm, before Wing scale)'
              : 'Planform'
        }}
        @if (drawing()?.selection; as selection) {
          · {{ selection }}
        }
      </figcaption>
      @if (drawing(); as d) {
        <svg [appPreviewViewport]="d.viewBox" role="img" aria-label="Generated geometry">
          @for (path of d.cells; track $index) {
            <path class="cell-selection" [attr.d]="path">
              <title>{{ d.selection }}</title>
            </path>
          }
          @for (path of d.ribs; track $index) {
            <path class="rib" [attr.d]="path" />
          }
          @for (curve of d.curves; track $index) {
            <path class="curve" [attr.d]="curve.path">
              <title>{{ curve.label }}</title>
            </path>
          }
          @for (path of d.highlights; track $index) {
            <path class="highlight selected" [attr.d]="path">
              <title>{{ d.selection }}</title>
            </path>
          }
          @for (marker of d.markers; track $index) {
            <circle
              [class.selected]="marker.selected"
              [attr.cx]="marker.point[0]"
              [attr.cy]="marker.point[1]"
              [attr.r]="d.radius * (marker.selected ? 1.5 : 1)"
            >
              <title>{{ marker.label }}</title>
            </circle>
          }
        </svg>
      } @else {
        <p class="empty">Correct the parameters to see the geometry.</p>
      }
      @if (metrics(); as m) {
        <p class="metrics">
          Flat: {{ m.flatSpan | number: '1.2-2' }} m · {{ m.flatArea | number: '1.2-2' }} m² · AR
          {{ m.flatAspectRatio | number: '1.2-2' }}
          <span
            >Projected: {{ m.projectedSpan | number: '1.2-2' }} m ·
            {{ m.projectedArea | number: '1.2-2' }} m² · AR
            {{ m.projectedAspectRatio | number: '1.2-2' }}</span
          >
          <span>{{ m.cells }} cells · Before Wing scale, as geometry-out.txt</span>
          <span>Focus a parameter group to highlight it.</span>
        </p>
      }
    </figure>
  `,
  styleUrls: ['./preview-layout.css', './preview.css'],
  styles: `
    .curve {
      fill: none;
      stroke: var(--mat-sys-primary);
      stroke-width: 1.5;
    }
    .highlight {
      fill: none;
    }
    .cell-selection {
      fill: color-mix(in srgb, var(--mat-sys-tertiary) 25%, transparent);
      stroke: var(--mat-sys-tertiary);
      stroke-width: 1.5;
    }
    .metrics {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 16px;
      font-variant-numeric: tabular-nums;
    }
    .empty {
      flex: 1;
      display: grid;
      place-content: center;
    }
  `,
})
export class PreprocessorPreview {
  readonly view = input('planform');
  private readonly editor = inject(EditorState);
  private readonly result = this.editor.generated;
  /** As in geometry-out.txt: the preprocessor does not know Wing scale. */
  protected readonly metrics = computed(() => {
    const result = this.result();
    return result && { ...result.metrics, cells: result.cells };
  });
  protected readonly drawing = computed(() => {
    const result = this.result();
    if (!result) return undefined;
    const focus = this.editor.preprocessorFocus();
    const view = this.view();
    const s =
      view === 'cells'
        ? cellBars(result, focus)
        : view === 'front'
          ? front(result, focus)
          : planform(result, this.editor.preprocessor.input(), focus);
    const bounds: Point[] = [];
    const path = (points: readonly Point[], close = false) => {
      bounds.push(...points);
      return pointPath(points, close);
    };
    const drawing = {
      curves: s.curves.map(({ points, label }) => ({ path: path(points), label })),
      ribs: s.ribs.map((points) => path(points)),
      markers: s.markers,
      highlights: s.highlights.map((points) => path(points)),
      cells: s.cells.map((points) => path(points, true)),
      selection: s.selection,
    };
    const b = previewBounds(bounds);
    return { ...drawing, viewBox: b.viewBox, radius: Math.max(b.right - b.left, 1) * 0.003 };
  });
}
