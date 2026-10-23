import { Component, inject } from '@angular/core';
import { EditorState } from './editor-state';
import { NumberField } from './number-field';
import { AddRow, RecordRow, RemoveRow } from './record-editor';
import { SelectField } from './select-field';
import { TableScroll } from './table-scroll';

@Component({
  selector: 'app-nose-mylars-section',
  imports: [AddRow, NumberField, RecordRow, RemoveRow, SelectField, TableScroll],
  template: `
    <div class="section-controls">
      <app-select-field
        label="Nose mylars mode"
        [field]="form.mode"
        [options]="[
          [0, 'Disabled'],
          [1, 'Enabled'],
        ]"
      />
    </div>
    @if (form.mode().value() !== 0) {
      <div appTableScroll role="region" aria-label="Mylar groups">
        <table class="parameter-table">
          <caption>
            Mylar groups
          </caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Group number</th>
              <th scope="col">First rib</th>
              <th scope="col">Last rib</th>
              <th scope="col">Mylar parameter 1</th>
              <th scope="col">Mylar parameter 2</th>
              <th scope="col">Mylar parameter 3</th>
              <th scope="col">Mylar parameter 4</th>
              <th scope="col">Mylar parameter 5</th>
              <th scope="col">Mylar parameter 6</th>
              <th scope="col" class="row-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (group of form.groups; track group; let i = $index) {
              <tr [appRecordRow]="form.groups" [index]="i">
                <th scope="row">{{ i + 1 }}</th>
                <td>
                  <app-number-field compact label="Group number" integer [field]="group.group" />
                </td>
                <td>
                  <app-number-field compact label="First rib" integer [field]="group.firstRib" />
                </td>
                <td>
                  <app-number-field compact label="Last rib" integer [field]="group.lastRib" />
                </td>
                <td>
                  <app-number-field compact label="Mylar parameter 1" [field]="group.values[0]" />
                </td>
                <td>
                  <app-number-field compact label="Mylar parameter 2" [field]="group.values[1]" />
                </td>
                <td>
                  <app-number-field compact label="Mylar parameter 3" [field]="group.values[2]" />
                </td>
                <td>
                  <app-number-field compact label="Mylar parameter 4" [field]="group.values[3]" />
                </td>
                <td>
                  <app-number-field compact label="Mylar parameter 5" [field]="group.values[4]" />
                </td>
                <td>
                  <app-number-field compact label="Mylar parameter 6" [field]="group.values[5]" />
                </td>
                <td class="row-actions">
                  <app-remove-row [rows]="form.groups" [index]="i" label="mylar group" />
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <app-add-row
        label="mylar group"
        [rows]="form.groups"
        [max]="100"
        [row]="{
          group: form.groups.length + 1,
          firstRib: 1,
          lastRib: 1,
          values: [0, 0, 0, 0, 0, 0],
        }"
      />
    }
  `,
  styleUrl: './section.css',
})
export class NoseMylarsSection {
  protected readonly editor = inject(EditorState);
  protected readonly form = this.editor.form.noseMylars;
}
