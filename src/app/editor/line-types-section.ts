import { Component, inject } from '@angular/core';
import { EditorState } from './editor-state';
import { NumberField } from './number-field';
import { AddRow, RecordRow, RemoveRow } from './record-editor';
import { SelectField } from './select-field';
import { TableScroll } from './table-scroll';
import { TextField } from './text-field';

@Component({
  selector: 'app-line-types-section',
  imports: [AddRow, NumberField, RecordRow, RemoveRow, SelectField, TableScroll, TextField],
  template: `
    <div class="section-controls">
      <app-select-field
        label="Line types mode"
        [field]="form.mode"
        [options]="[
          [0, 'Engine table of six types'],
          [1, 'Custom table'],
        ]"
      />
    </div>
    @if (form.mode().value() !== 0) {
      <div appTableScroll role="region" aria-label="Line types">
        <table class="parameter-table">
          <caption>
            Line types
          </caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Type number</th>
              <th scope="col">Type name</th>
              <th scope="col">Cross section</th>
              <th scope="col">Diameter (mm)</th>
              <th scope="col">Width (mm)</th>
              <th scope="col">Thickness (mm)</th>
              <th scope="col">Strength (daN)</th>
              <th scope="col">Material</th>
              <th scope="col">Weight (g/m)</th>
              <th scope="col">Loop type</th>
              <th scope="col">Loop length (cm)</th>
              <th scope="col">DXF color</th>
              <th scope="col" class="row-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (line of form.types; track line; let i = $index) {
              <tr [appRecordRow]="form.types" [index]="i">
                <th scope="row">{{ i + 1 }}</th>
                <td>
                  <app-number-field compact label="Type number" integer [field]="line.number" />
                </td>
                <td><app-text-field compact label="Type name" [field]="line.name" /></td>
                <td>
                  <app-select-field
                    compact
                    label="Cross section"
                    [field]="line.kind"
                    [options]="[
                      ['r', 'Rectangular riser'],
                      ['c', 'Circular line'],
                    ]"
                  />
                </td>
                <td>
                  @if (line.kind().value() === 'c') {
                    <app-number-field compact label="Diameter" unit="mm" [field]="line.diameter" />
                  } @else {
                    <span aria-label="Not used for this cross section">—</span>
                  }
                </td>
                <td>
                  @if (line.kind().value() === 'r') {
                    <app-number-field compact label="Width" unit="mm" [field]="line.width" />
                  } @else {
                    <span aria-label="Not used for this cross section">—</span>
                  }
                </td>
                <td>
                  @if (line.kind().value() === 'r') {
                    <app-number-field
                      compact
                      label="Thickness"
                      unit="mm"
                      [field]="line.thickness"
                    />
                  } @else {
                    <span aria-label="Not used for this cross section">—</span>
                  }
                </td>
                <td>
                  <app-number-field compact label="Strength" unit="daN" [field]="line.strength" />
                </td>
                <td><app-text-field compact label="Material" [field]="line.material" /></td>
                <td>
                  <app-number-field compact label="Weight" unit="g/m" [field]="line.weight" />
                </td>
                <td>
                  <app-select-field
                    compact
                    label="Loop type"
                    [field]="line.loopType"
                    [options]="[
                      ['s', 'Stitched'],
                      ['p', 'Spliced'],
                    ]"
                  />
                </td>
                <td>
                  <app-number-field
                    compact
                    label="Loop length"
                    unit="cm"
                    [field]="line.loopLength"
                  />
                </td>
                <td>
                  <app-number-field compact label="DXF color" integer [field]="line.color" />
                </td>
                <td class="row-actions">
                  <app-remove-row [rows]="form.types" [index]="i" label="line type" />
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <app-add-row
        label="line type"
        [rows]="form.types"
        [max]="50"
        [row]="{
          number: form.types.length + 1,
          kind: 'c',
          diameter: 1,
          width: 0,
          thickness: 0,
          name: 'Line',
          strength: 1,
          material: 'dyneema',
          weight: 1,
          loopType: 's',
          loopLength: 10,
          color: 7,
        }"
      />
    }
  `,
  styleUrl: './section.css',
})
export class LineTypesSection {
  protected readonly editor = inject(EditorState);
  protected readonly form = this.editor.form.lineTypes;
}
