import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { EditorState } from './editor-state';
import { pointPath, previewBounds, type Point } from './preview-geometry';
import { PreviewViewport } from './preview-viewport';

const mirror = (points: readonly Point[]): Point[] => [
  ...[...points].reverse().map(([x, y]): Point => [-x, y]),
  ...points,
];

/** The nearest contour point to `x`. */
const at = (points: readonly Point[], x: number): Point =>
  points.reduce((a, b) => (Math.abs(a[0] - x) < Math.abs(b[0] - x) ? a : b));

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
      </figcaption>
      @if (drawing(); as d) {
        <svg [appPreviewViewport]="d.viewBox" role="img" aria-label="Generated geometry">
          @for (path of d.ribs; track $index) {
            <path class="rib" [attr.d]="path" />
          }
          @for (path of d.curves; track $index) {
            <path class="curve" [attr.d]="path" />
          }
          @for (marker of d.markers; track $index) {
            <circle [attr.cx]="marker.point[0]" [attr.cy]="marker.point[1]" [attr.r]="d.radius">
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
  private readonly result = computed(() => {
    const result = this.editor.preprocessor.result();
    return result.ok ? result.value : undefined;
  });
  /** As in geometry-out.txt: the preprocessor does not know Wing scale. */
  protected readonly metrics = computed(() => {
    const result = this.result();
    return result && { ...result.metrics, cells: result.cells };
  });
  protected readonly drawing = computed(() => {
    const result = this.result();
    if (!result) return undefined;
    const bounds: Point[] = [];
    const path = (points: readonly Point[]) => {
      bounds.push(...points);
      return pointPath(points);
    };
    const curves: string[] = [];
    const ribs: string[] = [];
    const markers: { point: Point; label: string }[] = [];
    const { leadingEdge, trailingEdge, vault, vaultJunctions } = result.curves;
    if (this.view() === 'cells') {
      const widths = result.ribs
        .map((rib, i) => (i === 0 ? rib.x * 2 : rib.x - result.ribs[i - 1].x))
        .filter((width) => width > 0);
      // A horizontal bar per cell: x is its width in cm, y its index.
      const spacing = Math.max(...widths, 1) / widths.length;
      widths.forEach((w, i) =>
        curves.push(
          path([
            [0, i * spacing],
            [w, i * spacing],
          ]),
        ),
      );
    } else if (this.view() === 'front') {
      curves.push(path(mirror(vault)));
      for (const rib of result.ribs)
        markers.push({
          point: [rib.xp, rib.z],
          label: `Rib ${rib.number} · Inclination ${rib.beta.toFixed(2)}°`,
        });
      vaultJunctions.forEach((point, i) => markers.push({ point, label: `Arc junction ${i + 1}` }));
    } else {
      curves.push(path(mirror(leadingEdge)), path(mirror(trailingEdge)));
      for (const rib of result.ribs)
        for (const sign of [-1, 1])
          ribs.push(
            path([
              [rib.x * sign, rib.yLE],
              [rib.x * sign, rib.yTE],
            ]),
          );
      const { leadingEdge: le, trailingEdge: te } = this.editor.preprocessor.input();
      const starts = [
        [leadingEdge, le.x1, 'Leading edge correction 1'],
        [leadingEdge, le.x2, 'Leading edge correction 2'],
        [trailingEdge, te.x1, 'Trailing edge correction'],
      ] as const;
      for (const [points, x, label] of starts)
        markers.push({ point: at(points, x), label: `${label} starts at ${x} cm` });
    }
    const b = previewBounds(bounds);
    return {
      viewBox: b.viewBox,
      curves,
      ribs,
      markers,
      radius: Math.max(b.right - b.left, 1) * 0.003,
    };
  });
}
