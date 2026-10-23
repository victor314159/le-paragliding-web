import { Component, inject } from '@angular/core';
import { EditorState } from './editor-state';
import { NumberField } from './number-field';
import { AddRow, RecordRow, RemoveRow } from './record-editor';
import { SelectField } from './select-field';
import { TableScroll } from './table-scroll';

@Component({
  selector: 'app-thickness-section',
  imports: [AddRow, NumberField, RecordRow, RemoveRow, SelectField, TableScroll],
  template: `
    <div class="section-controls">
      <app-select-field
        label="Thickness mode"
        [field]="form.mode"
        [options]="[
          [0, 'Disabled'],
          [1, 'Enabled'],
        ]"
      />
    </div>
    @if (form.mode().value() !== 0) {
      <p>
        One coefficient per rib of the half wing: 1 keeps its thickness, 0 makes a zero-thickness
        airfoil.
      </p>
      <div appTableScroll role="region" aria-label="Rib thickness coefficients">
        <table class="parameter-table">
          <caption>
            Rib thickness coefficients
          </caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Thickness coefficient</th>
              <th scope="col" class="row-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (rib of form.ribs; track rib; let i = $index) {
              <tr [appRecordRow]="form.ribs" [index]="i">
                <th scope="row">{{ i + 1 }}</th>
                <td>
                  <app-number-field compact label="Thickness coefficient" [field]="rib" />
                </td>
                <td class="row-actions">
                  <app-remove-row [rows]="form.ribs" [index]="i" label="rib coefficient" />
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <app-add-row label="rib coefficient" [rows]="form.ribs" [max]="100" [row]="1" />
    }
  `,
  styleUrl: './section.css',
})
export class ThicknessSection {
  protected readonly editor = inject(EditorState);
  protected readonly form = this.editor.form.thickness;
}
