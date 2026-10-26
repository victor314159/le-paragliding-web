import { Component, computed, inject, signal, type Injector } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatButtonToggle, MatButtonToggleGroup } from '@angular/material/button-toggle';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
  type MatDialog,
} from '@angular/material/dialog';
import { wingMetrics, type WingMetrics } from '@lepara/design';
import type { LepDesign } from '@lepara/format';
import { geometryComparisonScene } from '@lepara/views';
import { map, type Observable } from 'rxjs';
import { ScenePreview } from './scene-preview';

export interface GeometryComparisonData {
  readonly title: string;
  readonly message: string;
  /** What section 1 is compared with, as in "section 1 and applied". */
  readonly change: string;
  readonly confirm: string;
  readonly before: Pick<LepDesign, 'geometry'>;
  readonly after: Pick<LepDesign, 'geometry'>;
}

const ROWS: readonly [string, keyof WingMetrics, string][] = [
  ['Flat span', 'flatSpan', ' m'],
  ['Flat area', 'flatArea', ' m²'],
  ['Flat aspect ratio', 'flatAspectRatio', ''],
  ['Projected span', 'projectedSpan', ' m'],
  ['Projected area', 'projectedArea', ' m²'],
  ['Projected aspect ratio', 'projectedAspectRatio', ''],
];

/** The metrics of section 1 `before` and `after`, formatted, and their cells. */
function metricRows(before: Pick<LepDesign, 'geometry'>, after: Pick<LepDesign, 'geometry'>) {
  const metrics = [wingMetrics(before), wingMetrics(after)];
  return [
    ...ROWS.map(([label, key, unit]) => {
      const [now, next] = metrics.map((m) => (m ? `${m[key].toFixed(2)}${unit}` : '—'));
      return { label, before: now, after: next };
    }),
    { label: 'Cells', before: `${before.geometry.cells}`, after: `${after.geometry.cells}` },
  ];
}

/** Asks before replacing section 1 or the Auto shape, showing section 1 before and after. */
@Component({
  selector: 'app-geometry-comparison-dialog',
  imports: [
    MatButton,
    MatButtonToggle,
    MatButtonToggleGroup,
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatDialogClose,
    ScenePreview,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p>{{ data.message }}</p>
      <mat-button-toggle-group
        aria-label="Comparison view"
        hideSingleSelectionIndicator
        [value]="view()"
        (change)="view.set($event.value)"
      >
        <mat-button-toggle value="planform">Planform</mat-button-toggle>
        <mat-button-toggle value="front">Front</mat-button-toggle>
      </mat-button-toggle-group>
      <div class="comparison">
        <app-scene-preview [scene]="scene()" />
        <table>
          <caption>
            At Wing scale
          </caption>
          <thead>
            <tr>
              <th scope="col"></th>
              <th scope="col">Section 1</th>
              <th scope="col">{{ change }}</th>
            </tr>
          </thead>
          <tbody>
            @for (row of rows; track row.label) {
              <tr>
                <th scope="row">{{ row.label }}</th>
                <td>{{ row.before }}</td>
                <td>{{ row.after }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions>
      <button matButton type="button" [mat-dialog-close]="false">Cancel</button>
      <button matButton="filled" type="button" [mat-dialog-close]="true">
        {{ data.confirm }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .comparison {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 24px;
      margin-top: 8px;
    }
    app-scene-preview {
      display: flex;
      flex: 1 1 360px;
      height: 280px;
    }
    table {
      border-collapse: collapse;
      font: var(--mat-sys-body-medium);
    }
    caption {
      text-align: start;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    th,
    td {
      padding: 2px 16px 2px 0;
      text-align: end;
    }
    th[scope='row'] {
      text-align: start;
      font-weight: normal;
    }
  `,
})
export class GeometryComparisonDialog {
  protected readonly data = inject<GeometryComparisonData>(MAT_DIALOG_DATA);
  protected readonly change = this.data.change[0].toUpperCase() + this.data.change.slice(1);
  protected readonly view = signal('planform');
  protected readonly scene = computed(() =>
    geometryComparisonScene(this.data.before, this.data.after, this.view(), this.data.change),
  );
  protected readonly rows = metricRows(this.data.before, this.data.after);
}

/**
 * Emits once: true if confirmed. `injector` provides the editor's state to
 * the preview.
 */
export function confirmGeometry(
  dialogs: MatDialog,
  injector: Injector,
  data: GeometryComparisonData,
): Observable<boolean> {
  return dialogs
    .open<GeometryComparisonDialog, GeometryComparisonData, boolean>(GeometryComparisonDialog, {
      data,
      injector,
      width: '880px',
    })
    .afterClosed()
    .pipe(map((confirmed) => !!confirmed));
}
