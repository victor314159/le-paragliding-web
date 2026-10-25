import { Component, computed, inject, input } from '@angular/core';
import { centroid, finite, pointPath, previewBounds, ribNumbers, type Point } from '@lepara/views';
import { EditorState } from './editor-state';
import { PreviewViewport } from './preview-viewport';

@Component({
  selector: 'app-geometry-preview',
  imports: [PreviewViewport],
  template: `
    <figure>
      @if (view() === 'planform') {
        <figcaption>Planform</figcaption>
        @if (plan().ribs.length) {
          <svg [appPreviewViewport]="plan().viewBox" role="img" aria-label="Wing planform">
            <path class="outline" [attr.d]="plan().outline" />
            <line class="axis" x1="0" x2="0" [attr.y1]="plan().top" [attr.y2]="plan().bottom" />
            @for (rib of plan().ribs; track $index) {
              <line
                class="rib"
                [class.selected]="rib.index === row()"
                [attr.x1]="rib.x"
                [attr.x2]="rib.x"
                [attr.y1]="rib.le"
                [attr.y2]="rib.te"
              >
                <title>
                  Rib {{ rib.number }} · X {{ rib.x }} · LE {{ rib.le }} · TE {{ rib.te }} cm
                </title>
              </line>
            }
            @for (label of plan().numbers; track label.index) {
              <text
                class="rib-number"
                [class.current]="label.index === row()"
                [attr.x]="label.point[0]"
                [attr.y]="label.point[1]"
                [attr.font-size]="plan().fontSize"
              >
                {{ label.text }}
              </text>
            }
          </svg>
        } @else {
          <p>Enter rib X and leading/trailing edge Y coordinates to preview the planform.</p>
        }
      } @else {
        <figcaption>Front view</figcaption>
        @if (front().ribs.length) {
          <svg [appPreviewViewport]="front().viewBox" role="img" aria-label="Wing front view">
            <line class="axis" [attr.x1]="front().left" [attr.x2]="front().right" y1="0" y2="0" />
            <path class="arch" [attr.d]="front().arch" />
            @for (rib of front().ribs; track $index) {
              <circle
                [class.selected]="rib.index === row()"
                [attr.cx]="rib.x"
                [attr.cy]="rib.z"
                [attr.r]="front().radius * (rib.index === row() ? 2 : 1)"
              >
                <title>Rib {{ rib.number }} · X′ {{ rib.x }} · Z {{ rib.z }} cm</title>
              </circle>
            }
            @for (label of front().numbers; track label.index) {
              <text
                class="rib-number"
                [class.current]="label.index === row()"
                [attr.x]="label.point[0]"
                [attr.y]="label.point[1]"
                [attr.font-size]="front().fontSize"
              >
                {{ label.text }}
              </text>
            }
          </svg>
        } @else {
          <p>Enter rib X′ and Z coordinates to preview the vault.</p>
        }
      }
      <p>Input coordinates · Mirrored wing. Focus a rib row to highlight it.</p>
    </figure>
  `,
  styleUrls: ['./preview-layout.css', './preview.css'],
})
export class GeometryPreview {
  readonly row = input(0);
  readonly view = input<'planform' | 'front'>('planform');
  private readonly editor = inject(EditorState);
  protected readonly plan = computed(() => {
    const ribs = this.editor.draft
      .value()
      .geometry.ribs.flatMap((r, index) =>
        finite(r.x) && finite(r.yLE) && finite(r.yTE)
          ? [{ index, number: r.number, x: r.x, le: r.yLE, te: r.yTE }]
          : [],
      );
    const mirrored = [...[...ribs].reverse().map((r) => ({ ...r, x: -r.x })), ...ribs];
    const points: Point[] = [
      ...mirrored.map((r): Point => [r.x, r.le]),
      ...[...mirrored].reverse().map((r): Point => [r.x, r.te]),
    ];
    const bounds = previewBounds(points);
    const fontSize = (bounds.right - bounds.left) * 0.016;
    const numbers = ribNumbers(
      ribs.map((r) => ({ index: r.index, point: [r.x, r.te], direction: [0, r.te - r.le] })),
      fontSize,
      this.row(),
    );
    return { ribs: mirrored, outline: pointPath(points, true), numbers, fontSize, ...bounds };
  });
  protected readonly front = computed(() => {
    const ribs = this.editor.draft
      .value()
      .geometry.ribs.flatMap((r, index) =>
        finite(r.xp) && finite(r.z) ? [{ index, number: r.number, x: r.xp, z: r.z }] : [],
      );
    const mirrored = [...[...ribs].reverse().map((r) => ({ ...r, x: -r.x })), ...ribs];
    const points = mirrored.map((r): Point => [r.x, r.z]);
    const bounds = previewBounds(points);
    const center = centroid(points);
    const fontSize = (bounds.right - bounds.left) * 0.016;
    const numbers = ribNumbers(
      ribs.map((r) => ({
        index: r.index,
        point: [r.x, r.z],
        direction: [r.x - center[0], r.z - center[1]],
      })),
      fontSize,
      this.row(),
    );
    return {
      ribs: mirrored,
      arch: pointPath(points),
      numbers,
      fontSize,
      radius: Math.max(bounds.right - bounds.left, 1) * 0.003,
      ...bounds,
    };
  });
}
