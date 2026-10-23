import { Component, inject } from '@angular/core';
import { EditorState } from './editor-state';
import { NumberField } from './number-field';
import { AddRow, RecordRow, RemoveRow } from './record-editor';
import { TableScroll } from './table-scroll';

@Component({
  selector: 'app-rib-points-section',
  imports: [AddRow, NumberField, RecordRow, RemoveRow, TableScroll],
  template: `
    <div appTableScroll role="region" aria-label="Additional rib points">
      <table class="parameter-table">
        <caption>
          Additional rib points
        </caption>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">X (% chord)</th>
            <th scope="col">Y (% chord)</th>
            <th scope="col" class="row-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          @for (point of form; track point; let i = $index) {
            <tr [appRecordRow]="form" [index]="i">
              <th scope="row">{{ i + 1 }}</th>
              <td>
                <app-number-field compact label="X" unit="% chord" [field]="point[0]" />
              </td>
              <td>
                <app-number-field compact label="Y" unit="% chord" [field]="point[1]" />
              </td>
              <td class="row-actions">
                <app-remove-row [rows]="form" [index]="i" label="point" />
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
    <app-add-row label="point" [rows]="form" [max]="10" [row]="[0, 0]" />
  `,
  styleUrl: './section.css',
})
export class RibPointsSection {
  protected readonly editor = inject(EditorState);
  protected readonly form = this.editor.form.ribPoints;
}
