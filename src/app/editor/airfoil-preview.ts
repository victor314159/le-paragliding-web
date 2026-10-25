import { Component, computed, inject, input } from '@angular/core';
import { finite, pointPath, previewBounds, valueLabel, type Point } from '@lepara/views';
import { airfoilPart } from './airfoil-section';
import { EditorState } from './editor-state';
import { PreviewViewport } from './preview-viewport';

/** The points of an airfoil as typed, y up, with the selected row's point highlighted. */
@Component({
  selector: 'app-airfoil-preview',
  imports: [PreviewViewport],
  template: `
    <figure>
      <figcaption>
        {{ name() }} · {{ data().points.length }} points · thickness {{ data().thickness }}
        @if (data().selected; as point) {
          · Point {{ point.index + 1 }}: ({{ point.label }})
        }
      </figcaption>
      @if (data().points.length) {
        <svg
          [appPreviewViewport]="data().viewBox"
          role="img"
          [attr.aria-label]="'Airfoil ' + name()"
        >
          <path [attr.d]="data().outline" class="profile" />
          <line x1="0" y1="0" x2="1" y2="0" class="chord" />
          @if (data().inlet) {
            <path [attr.d]="data().inlet" class="intake" />
          }
          @for (point of data().points; track point.index) {
            <circle
              [class.inlet-point]="point.inlet"
              [attr.cx]="point.x"
              [attr.cy]="point.y"
              r="0.0035"
            >
              <title>Point {{ point.index + 1 }} · {{ point.label }}</title>
            </circle>
          }
          @if (data().selected; as point) {
            <circle class="selected" [attr.cx]="point.x" [attr.cy]="point.y" r="0.009" />
          }
        </svg>
        <p>
          {{
            data().txt
              ? 'Red: air inlet points · Ringed: the selected row · Dashed: the chord.'
              : 'Ringed: the selected row · Dashed: the chord · The engine places the air inlet from section 2.'
          }}
        </p>
      } @else {
        <p>Add points with finite coordinates to preview this airfoil.</p>
      }
    </figure>
  `,
  styleUrl: './preview-layout.css',
  styles: `
    path,
    line,
    circle {
      vector-effect: non-scaling-stroke;
    }
    .profile {
      fill: var(--mat-sys-secondary-container);
      stroke: var(--mat-sys-primary);
      stroke-width: 1.5;
    }
    .chord {
      stroke: var(--mat-sys-outline);
      stroke-width: 1;
      stroke-dasharray: 4 4;
    }
    .intake {
      fill: none;
      stroke: #d04b47;
      stroke-width: 3;
    }
    circle {
      fill: var(--mat-sys-primary);
    }
    circle.inlet-point {
      fill: #d04b47;
    }
    circle.selected {
      fill: none;
      stroke: var(--mat-sys-tertiary);
      stroke-width: 2.5;
    }
  `,
})
export class AirfoilPreview {
  readonly name = input.required<string>();
  private readonly editor = inject(EditorState);
  protected readonly data = computed(() => {
    const airfoil = this.editor.draft.airfoilValue()[this.name()];
    const txt = airfoil?.format === 'txt';
    const points = (airfoil?.points ?? []).flatMap(([x, y], index) =>
      finite(x) && finite(y)
        ? [
            {
              index,
              x,
              y: -y,
              label: `${valueLabel(x)}, ${valueLabel(y)}`,
              inlet: txt && airfoilPart(airfoil, index) === 'inlet',
            },
          ]
        : [],
    );
    const drawn = points.map(({ x, y }): Point => [x, y]);
    const inlet = points.filter((point) => point.inlet).map(({ x, y }): Point => [x, y]);
    const heights = points.map(({ y }) => y);
    const rows = this.editor.airfoilForm[this.name()]?.points;
    const selectedIndex = rows ? this.editor.selectedRecord(rows) : -1;
    return {
      txt,
      points,
      outline: drawn.length ? pointPath(drawn, true) : '',
      inlet: inlet.length > 1 ? pointPath(inlet) : '',
      thickness: points.length
        ? `${valueLabel((Math.max(...heights) - Math.min(...heights)) * 100)} % chord`
        : '—',
      selected: points.find((point) => point.index === selectedIndex),
      viewBox: previewBounds([...drawn, [0, 0], [1, 0]]).viewBox,
    };
  });
}
