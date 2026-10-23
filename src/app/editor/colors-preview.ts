import { Component, computed, inject } from '@angular/core';
import { EditorState } from './editor-state';
import { colorPlanform } from './preview-patterns';
import { finite, previewBounds, ribNumbers } from './preview-geometry';
import { PreviewViewport } from './preview-viewport';

@Component({
  selector: 'app-colors-preview',
  imports: [PreviewViewport],
  template: `
    <figure>
      <figcaption>{{ upper() ? 'Extrados' : 'Intrados' }} · color layout</figcaption>
      <svg
        [appPreviewViewport]="data().viewBox"
        role="img"
        [attr.aria-label]="(upper() ? 'Extrados' : 'Intrados') + ' color cuts and rib marks'"
      >
        @for (side of [-1, 1]; track side) {
          <g [attr.transform]="'scale(' + side + ',1)'">
            @for (panel of data().panels; track panel.number) {
              @for (region of panel.regions; track $index) {
                <path
                  class="color-region"
                  [attr.data-band]="region.band % 3"
                  [attr.d]="region.path"
                />
              }
              <path
                class="panel"
                [class.active-panel]="panel.record === selected() && panel.record >= 0"
                [attr.d]="panel.path"
              >
                <title>Panel {{ panel.number }}</title>
              </path>
              @for (cut of panel.cuts; track cut.index) {
                <line
                  class="color-cut"
                  [class.active-cut]="panel.record === selected() && cut.index === active()"
                  [attr.x1]="cut.points[0][0]"
                  [attr.y1]="cut.points[0][1]"
                  [attr.x2]="cut.points[1][0]"
                  [attr.y2]="cut.points[1][1]"
                >
                  <title>
                    Panel {{ panel.number }} · Cut {{ cut.number }} · {{ cut.left }}% /
                    {{ cut.right }}% from TE
                  </title>
                </line>
              }
            }
            @for (mark of data().marks; track $index) {
              <circle
                class="color-mark"
                [class.selected]="mark.record === selected() && mark.index === active()"
                [attr.cx]="mark.point[0]"
                [attr.cy]="mark.point[1]"
                [attr.r]="
                  data().radius * (mark.record === selected() && mark.index === active() ? 1.7 : 1)
                "
              >
                <title>
                  Rib {{ mark.rib }} · Mark {{ mark.number }} · {{ mark.percent }}% from TE
                </title>
              </circle>
            }
          </g>
        }
        @for (label of data().numbers; track label.index) {
          <text
            class="rib-number"
            [attr.x]="label.point[0]"
            [attr.y]="label.point[1]"
            [attr.font-size]="data().fontSize"
          >
            {{ label.text }}
          </text>
        }
      </svg>
      <p>
        @if (layout().mode === 'panels') {
          Positions from TE · Shading distinguishes regions, not fabric colors. Selected panel and
          cut highlighted.
        } @else {
          Marks on ribs, measured from TE · No connections inferred between marks.
        }
        @if (data().omitted) {
          {{ data().omitted }} incomplete or out-of-range marks/cuts omitted.
        }
        @if (data().crossed) {
          Crossing cuts: only boundaries shown in affected panels.
        }
      </p>
    </figure>
  `,
  styleUrls: ['./preview-layout.css', './preview.css'],
  styles: `
    .panel {
      fill: none;
      stroke: var(--mat-sys-outline);
      stroke-width: 1;
    }
    .active-panel {
      stroke: var(--mat-sys-primary);
      stroke-width: 2.5;
    }
    .color-region {
      stroke: none;
      fill: var(--mat-sys-surface-container-high);
    }
    .color-region[data-band='1'] {
      fill: color-mix(in srgb, #13899d 30%, var(--mat-sys-surface));
    }
    .color-region[data-band='2'] {
      fill: color-mix(in srgb, #b38900 30%, var(--mat-sys-surface));
    }
    .color-cut {
      stroke: var(--mat-sys-primary);
      stroke-width: 1.5;
    }
    .active-cut {
      stroke: var(--mat-sys-tertiary);
      stroke-width: 3;
    }
  `,
})
export class ColorsPreview {
  protected readonly editor = inject(EditorState);
  protected readonly upper = computed(() => this.editor.selection() === 15);
  protected readonly fields = computed(() =>
    this.upper() ? this.editor.form.extradosColors : this.editor.form.intradosColors,
  );
  protected readonly layout = computed(() =>
    this.upper()
      ? this.editor.draft.value().extradosColors
      : this.editor.draft.value().intradosColors,
  );
  protected readonly selected = computed(() =>
    this.layout().mode === 'panels'
      ? this.editor.selectedRecord(this.fields().panels)
      : this.editor.selectedRecord(this.fields().ribs),
  );
  protected readonly active = computed(() => {
    const field = this.fields();
    const rows =
      this.layout().mode === 'panels'
        ? field.panels[this.selected()]?.cuts
        : field.ribs[this.selected()]?.marks;
    return rows ? this.editor.selectedRecord(rows) : 0;
  });
  protected readonly data = computed(() => {
    const geometry = this.editor.draft.value().geometry;
    const layout = colorPlanform(geometry, this.layout());
    const bounds = previewBounds(
      layout.panels.flatMap((p) =>
        p.points.flatMap(
          ([x, y]) =>
            [
              [x, y],
              [-x, y],
            ] as const,
        ),
      ),
    );
    const fontSize = (bounds.right - bounds.left) * 0.016;
    const numbers = ribNumbers(
      geometry.ribs.flatMap((r, index) =>
        finite(r.x) && finite(r.yLE) && finite(r.yTE)
          ? [{ index, point: [r.x, r.yTE] as const, direction: [0, r.yTE - r.yLE] as const }]
          : [],
      ),
      fontSize,
    );
    return {
      ...layout,
      ...bounds,
      numbers,
      fontSize,
      crossed: layout.panels.some((p) => p.crossed),
      radius: (bounds.right - bounds.left) * 0.003,
    };
  });
}
