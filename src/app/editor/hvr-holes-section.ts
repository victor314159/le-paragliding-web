import { Component, inject } from '@angular/core';
import { EditorState } from './editor-state';
import { NumberField } from './number-field';
import { AddRow, RecordRow, RemoveRow } from './record-editor';
import { SelectField } from './select-field';
import { TableScroll } from './table-scroll';

@Component({
  selector: 'app-hvr-holes-section',
  imports: [AddRow, NumberField, RecordRow, RemoveRow, SelectField, TableScroll],
  template: `
    <div class="section-controls">
      <app-select-field
        label="HVR holes mode"
        [field]="form.mode"
        [options]="[
          [0, 'Disabled'],
          [1, 'Enabled'],
        ]"
      />
    </div>
    @if (form.mode().value() !== 0) {
      <p>Enabling this section also enables reading the six separation factors in section 39.</p>
      <div appTableScroll role="region" aria-label="HVR holes">
        <table class="parameter-table">
          <caption>
            HVR holes
          </caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Row number</th>
              <th scope="col">V-rib type</th>
              <th scope="col">Holes output</th>
              <th scope="col">Hole count</th>
              <th scope="col">Hole height (% local height)</th>
              <th scope="col">Hole width (%) / a:b</th>
              <th scope="col">Center factor / displacement</th>
              <th scope="col">Rotation (type 9)</th>
              <th scope="col">Unused parameter</th>
              <th scope="col" class="row-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (row of form.rows; track row; let i = $index) {
              <tr [appRecordRow]="form.rows" [index]="i">
                <th scope="row">{{ i + 1 }}</th>
                <td>
                  <app-number-field compact label="Row number" integer [field]="row.number" />
                </td>
                <td>
                  <app-select-field
                    compact
                    label="V-rib type"
                    [field]="row.type"
                    [options]="[
                      [5, 'Continuous VH-rib'],
                      [6, 'General diagonal'],
                      [9, 'Airfoil minirib'],
                      [15, 'Continuous VH-rib in % chord'],
                      [16, 'General diagonal in % chord'],
                    ]"
                  />
                </td>
                <td>
                  <app-select-field
                    compact
                    label="Holes output"
                    [field]="row.drawn"
                    [options]="[
                      [0, 'No holes'],
                      [1, 'Type 1 distribution'],
                    ]"
                  />
                </td>
                <td>
                  <app-number-field compact label="Hole count" integer [field]="row.holes" />
                </td>
                <td>
                  <app-number-field
                    compact
                    label="Hole height"
                    unit="% local height"
                    [field]="row.height"
                  />
                </td>
                <td>
                  <app-number-field
                    compact
                    [label]="row.type().value() === 9 ? 'Ellipse eccentricity a/b' : 'Hole width'"
                    [unit]="row.type().value() === 9 ? '' : '%'"
                    [field]="row.width"
                  />
                </td>
                <td>
                  <app-number-field
                    compact
                    [label]="
                      row.type().value() === 9 ? 'Chord displacement factor' : 'Center factor'
                    "
                    hint="Types 5/6/15/16: factor along the local height; type 9: displacement from the chord."
                    [field]="row.center"
                  />
                </td>
                <td>
                  <app-number-field
                    compact
                    label="Ellipse rotation"
                    hint="Type 9 only; ignored for other types."
                    unit="deg"
                    [field]="row.offset"
                  />
                </td>
                <td>
                  <app-number-field compact label="Unused parameter" [field]="row.unused" />
                </td>
                <td class="row-actions">
                  <app-remove-row [rows]="form.rows" [index]="i" label="hvr holes row" />
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <app-add-row
        label="hvr holes row"
        [rows]="form.rows"
        [max]="100"
        [row]="{
          number: form.rows.length + 1,
          type: 5,
          drawn: 1,
          holes: 0,
          height: 0,
          width: 0,
          center: 0.5,
          offset: 0,
          unused: 0,
        }"
      />
    }
  `,
  styleUrl: './section.css',
})
export class HvrHolesSection {
  protected readonly editor = inject(EditorState);
  protected readonly form = this.editor.form.hvrHoles;
}
