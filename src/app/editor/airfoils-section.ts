import { Component, inject } from '@angular/core';
import { EditorState } from './editor-state';
import { NumberField } from './number-field';
import { AddRow, RecordRow, RemoveRow } from './record-editor';
import { SelectField } from './select-field';
import { TableScroll } from './table-scroll';
import { TextField } from './text-field';

@Component({
  selector: 'app-airfoils-section',
  imports: [AddRow, NumberField, RecordRow, RemoveRow, SelectField, TableScroll, TextField],
  template: `
    <p>
      One row per rib of the half wing, in the same order as section 1. Airfoil coordinates are
      edited from the Airfoils navigation.
    </p>
    <div appTableScroll role="region" aria-label="Airfoil assignments">
      <table class="parameter-table">
        <caption>
          Airfoil assignments
        </caption>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Rib number</th>
            <th scope="col">Airfoil file</th>
            <th scope="col">Inlet start (% chord)</th>
            <th scope="col">Inlet end (% chord)</th>
            <th scope="col">Cell to the left</th>
            <th scope="col">Rib displacement (cm)</th>
            <th scope="col">Relative chord weight</th>
            <th scope="col">Minirib (% chord)</th>
            <th scope="col" class="row-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          @for (rib of form; track rib; let i = $index) {
            <tr [appRecordRow]="form" [index]="i">
              <th scope="row">{{ i + 1 }}</th>
              <td><app-number-field compact label="Rib number" [field]="rib.number" /></td>
              <td>
                <app-text-field
                  compact
                  label="Airfoil file"
                  hint="Existing .txt or .dat file in this project."
                  [field]="rib.airfoil"
                />
              </td>
              <td>
                <app-number-field
                  compact
                  label="Inlet start"
                  unit="% chord"
                  [field]="rib.intakeStart"
                />
              </td>
              <td>
                <app-number-field
                  compact
                  label="Inlet end"
                  unit="% chord"
                  [field]="rib.intakeEnd"
                />
              </td>
              <td>
                <app-select-field
                  compact
                  label="Cell to the left"
                  [field]="rib.open"
                  [options]="[
                    [0, 'Closed'],
                    [1, 'Open'],
                  ]"
                />
              </td>
              <td>
                <app-number-field
                  compact
                  label="Rib displacement"
                  unit="cm"
                  [field]="rib.displacement"
                />
              </td>
              <td>
                <app-number-field
                  compact
                  label="Relative chord weight"
                  hint="Usually 1."
                  [field]="rib.relativeWeight"
                />
              </td>
              <td>
                <app-number-field
                  compact
                  label="Minirib"
                  hint="Above 1: minirib length; 0 or 1 also controls single-skin triangles."
                  unit="% chord"
                  [field]="rib.minirib"
                />
              </td>
              <td class="row-actions">
                <app-remove-row [rows]="form" [index]="i" label="airfoil row" />
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
    <app-add-row
      label="airfoil row"
      [rows]="form"
      [max]="100"
      [row]="{
        number: form.length + 1,
        airfoil: form[0] ? form[0].airfoil().value() : '',
        intakeStart: 0,
        intakeEnd: 0,
        open: 1,
        displacement: 0,
        relativeWeight: 1,
        minirib: 0,
      }"
    />
  `,
  styleUrl: './section.css',
})
export class AirfoilsSection {
  protected readonly editor = inject(EditorState);
  protected readonly form = this.editor.form.airfoils;
}
