import { booleanAttribute, Component, computed, inject, input } from '@angular/core';
import { ribProfile } from '@lepara/views';
import { EditorState } from './editor-state';
import { PreviewViewport } from './preview-viewport';

/** A view of the input coordinates, independent of computing or preprocessing a wing. */
@Component({
  selector: 'app-rib-preview',
  imports: [PreviewViewport],
  template: `
    <figure>
      <figcaption>
        Rib {{ row() + 1 }} · {{ data().name || 'No airfoil assigned' }} · thickness ×{{
          data().thickness
        }}
        · {{ data().open === 1 ? 'Open' : 'Closed' }}
      </figcaption>
      @if (data().path) {
        <svg
          [appPreviewViewport]="data().viewBox"
          role="img"
          [attr.aria-label]="
            'Airfoil of rib ' +
            (row() + 1) +
            (anchors() ? ' and anchor positions on the chord' : ' and inlet positions')
          "
        >
          <line x1="0" y1="0" x2="1" y2="0" class="chord" />
          <path [attr.d]="data().path" class="profile" />
          @if (anchors()) {
            @for (anchor of data().anchors; track anchor.name) {
              <circle
                [attr.cx]="anchor.x"
                [attr.cy]="anchor.y"
                [style.fill]="anchor.color"
                r="0.008"
              >
                <title>
                  {{ anchor.name }} · {{ anchor.x * 100 }}% chord{{
                    anchor.onSurface ? ' · intrados' : ' · on chord (no contour at this position)'
                  }}
                </title>
              </circle>
              <text [attr.x]="anchor.x" [attr.y]="anchor.y + 0.05" text-anchor="middle">
                {{ anchor.name }}
              </text>
            }
          } @else {
            <path [attr.d]="data().intake" class="intake" />
            @for (position of data().inlet; track $index) {
              <line
                [attr.x1]="position"
                [attr.x2]="position"
                [attr.y1]="data().top"
                [attr.y2]="data().bottom"
                class="inlet"
              />
            }
          }
        </svg>
        <p>
          {{
            anchors()
              ? 'A–E: anchors · F: brake · Interpolated on the input intrados where available.'
              : 'Red contour: air inlet · Dashed lines: inlet limits (% chord).'
          }}
        </p>
      } @else {
        <p>
          The airfoil coordinates are unavailable. Choose an existing project airfoil to preview
          this rib.
        </p>
      }
    </figure>
  `,
  styleUrl: './preview-layout.css',
  styles: `
    .profile {
      fill: var(--mat-sys-secondary-container);
      stroke: var(--mat-sys-primary);
      stroke-width: 0.003;
    }
    .chord {
      stroke: var(--mat-sys-outline);
      stroke-width: 0.001;
      stroke-dasharray: 0.01;
    }
    .intake {
      fill: none;
      stroke: #d04b47;
      stroke-width: 0.006;
    }
    .inlet {
      stroke: var(--mat-sys-tertiary);
      stroke-width: 0.003;
      stroke-dasharray: 0.008;
    }
    circle {
      fill: var(--mat-sys-tertiary);
      stroke: var(--mat-sys-surface);
      stroke-width: 0.002;
    }
    text {
      fill: var(--mat-sys-on-surface);
      font-size: 0.026px;
    }
  `,
})
export class RibPreview {
  readonly row = input(0);
  readonly anchors = input(false, { transform: booleanAttribute });
  private readonly editor = inject(EditorState);
  protected readonly data = computed(() => {
    const project = this.editor.draft.project();
    const profile = ribProfile(project.design, project.airfoils, this.row());
    const row = project.design.airfoils[this.row()];
    const points = profile.points;
    const top = Math.min(-0.08, ...points.map((p) => p[1]));
    const bottom = Math.max(0.08, ...points.map((p) => p[1]));
    return {
      ...profile,
      path: points.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' '),
      viewBox: `-0.05 ${top - 0.04} 1.1 ${bottom - top + 0.12}`,
      top,
      bottom,
      labelY: bottom + 0.035,
      inlet: [row?.intakeStart, row?.intakeEnd]
        .filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
        .map((x) => x / 100),
    };
  });
}
