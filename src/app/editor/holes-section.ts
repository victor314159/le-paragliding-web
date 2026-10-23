import { Component, inject } from '@angular/core';
import type { DesignForm } from './editor-draft';
import { EditorState } from './editor-state';
import { NumberField } from './number-field';
import { TableScroll } from './table-scroll';
import {
  AddRow,
  RecordEditor,
  RecordFields,
  RecordRow,
  RemoveRow,
  ribRange,
} from './record-editor';
import { SelectField } from './select-field';

@Component({
  selector: 'app-holes-section',
  imports: [
    AddRow,
    NumberField,
    RecordEditor,
    RecordFields,
    RecordRow,
    RemoveRow,
    SelectField,
    TableScroll,
  ],
  template: `
    <app-record-editor [form]="form" label="Hole group" [summary]="groupSummary"
      ><ng-template [appRecordFields]="form" let-group let-i="index">
        <fieldset>
          <legend>Hole group {{ i + 1 }}</legend>
          <app-number-field label="First rib" integer [field]="group.firstRib" />
          <app-number-field label="Last rib" integer [field]="group.lastRib" />
          <div appTableScroll role="region" aria-label="Holes">
            <table class="parameter-table">
              <caption>
                Holes
              </caption>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Hole type</th>
                  <th scope="col">X position (% chord)</th>
                  <th scope="col">Y position (% chord)</th>
                  <th scope="col">Width / base (% chord)</th>
                  <th scope="col">Height (% chord)</th>
                  <th scope="col">Rotation (rad for ellipses, deg otherwise)</th>
                  <th scope="col">Parameter 6 (% chord)</th>
                  <th scope="col">Unused parameter 7</th>
                  <th scope="col" class="row-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (hole of group.holes; track hole; let h = $index) {
                  <tr [appRecordRow]="group.holes" [index]="h">
                    <th scope="row">{{ h + 1 }}</th>
                    <td>
                      <app-select-field
                        compact
                        label="Hole type"
                        [field]="hole.type"
                        [options]="[
                          [1, 'Ellipse'],
                          [2, 'Ellipse with strip (not implemented)'],
                          [3, 'Triangle'],
                          [4, 'Rectangle'],
                        ]"
                      />
                    </td>
                    <td>
                      <app-number-field
                        compact
                        label="X position"
                        unit="% chord"
                        hint="Percentage of chord; positions refer to the ellipse center or the reference corner."
                        [field]="hole.parameters[0]"
                      />
                    </td>
                    <td>
                      <app-number-field
                        compact
                        label="Y position"
                        unit="% chord"
                        hint="Percentage of chord; positions refer to the ellipse center or the reference corner."
                        [field]="hole.parameters[1]"
                      />
                    </td>
                    <td>
                      <app-number-field
                        compact
                        label="Width / base"
                        unit="% chord"
                        hint="Ellipse: horizontal semi-axis. Triangle: base. Rectangle: width, negative to extend left. All in % chord."
                        [field]="hole.parameters[2]"
                      />
                    </td>
                    <td>
                      <app-number-field
                        compact
                        label="Height"
                        unit="% chord"
                        hint="Ellipse: vertical semi-axis. Triangle or rectangle: height. All in % chord."
                        [field]="hole.parameters[3]"
                      />
                    </td>
                    <td>
                      <app-number-field
                        compact
                        label="Rotation"
                        [unit]="hole.type().value() === 1 ? 'rad' : 'deg'"
                        hint="Ellipse rotation is in radians in the engine; triangle and rectangle rotations are in degrees."
                        [field]="hole.parameters[4]"
                      />
                    </td>
                    <td>
                      <app-number-field
                        compact
                        [label]="
                          hole.type().value() === 2
                            ? 'Strip width'
                            : hole.type().value() === 1
                              ? 'Unused parameter 6'
                              : 'Corner radius'
                        "
                        unit="% chord"
                        hint="Unused values are normally 0."
                        [field]="hole.parameters[5]"
                      />
                    </td>
                    <td>
                      <app-number-field
                        compact
                        label="Unused parameter 7"
                        hint="Usually 0."
                        [field]="hole.parameters[6]"
                      />
                    </td>
                    <td class="row-actions">
                      <app-remove-row [rows]="group.holes" [index]="h" label="hole" />
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <app-add-row
            label="hole"
            [rows]="group.holes"
            [max]="200"
            [row]="{ type: 1, parameters: [0, 0, 0, 0, 0, 0, 0] }"
          />
        </fieldset> </ng-template
    ></app-record-editor>
    <app-add-row
      label="hole group"
      [rows]="form"
      [max]="100"
      [row]="{ firstRib: 1, lastRib: 1, holes: [] }"
    />
  `,
  styleUrl: './section.css',
})
export class HolesSection {
  protected readonly editor = inject(EditorState);
  protected readonly form = this.editor.form.holes;
  protected readonly groupSummary = (row: DesignForm['holes'][number]) =>
    `${ribRange(row)} · ${row.holes.length} holes`;
}
