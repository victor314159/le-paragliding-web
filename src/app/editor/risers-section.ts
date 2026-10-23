import { Component, inject } from '@angular/core';
import { EditorState } from './editor-state';
import { NumberField } from './number-field';
import { AddRow, RecordRow, RemoveRow } from './record-editor';
import { SelectField } from './select-field';
import { TableScroll } from './table-scroll';

@Component({
  selector: 'app-risers-section',
  imports: [AddRow, NumberField, RecordRow, RemoveRow, SelectField, TableScroll],
  template: `
    <div class="section-controls">
      <app-select-field
        label="Detailed risers mode"
        [field]="form.mode"
        [options]="[
          [0, 'Basic length from section 8'],
          [1, 'Custom risers'],
        ]"
      />
      @if (form.mode().value() !== 0) {
        <app-select-field
          label="Riser arrangement"
          [field]="form.type"
          [options]="[
            [1, 'Individual riser lengths'],
            [2, 'Vario seat · 2 points (unavailable)'],
            [3, 'Vario seat · 3 points (unavailable)'],
            [4, 'Vario seat · 4 points (unavailable)'],
          ]"
        />
      }
    </div>
    @if (form.mode().value() !== 0 && form.type().value() === 1) {
      <p>One length per line plan in section 9.</p>
      <div appTableScroll role="region" aria-label="Riser lengths">
        <table class="parameter-table">
          <caption>
            Riser lengths
          </caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Riser length (cm)</th>
              <th scope="col" class="row-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (length of form.lengths; track length; let i = $index) {
              <tr [appRecordRow]="form.lengths" [index]="i">
                <th scope="row">{{ i + 1 }}</th>
                <td>
                  <app-number-field compact label="Riser length" unit="cm" [field]="length" />
                </td>
                <td class="row-actions">
                  <app-remove-row [rows]="form.lengths" [index]="i" label="riser" />
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <app-add-row
        label="riser"
        [rows]="form.lengths"
        [max]="9"
        [row]="editor.form.angleOfAttack.risersLength().value()"
      />
    }
  `,
  styleUrl: './section.css',
})
export class RisersSection {
  protected readonly editor = inject(EditorState);
  protected readonly form = this.editor.form.risers;
}
