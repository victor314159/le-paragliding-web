import { Component, inject, input } from '@angular/core';
import type { DesignForm, EditorForm } from './editor-draft';
import { EditorState } from './editor-state';
import { NumberField } from './number-field';
import { AddRow, RecordEditor, RecordFields, RecordRow, RemoveRow } from './record-editor';
import { SelectField } from './select-field';
import { TableScroll } from './table-scroll';

/** The same rib marks and panel cuts for the extrados and intrados. */
@Component({
  selector: 'app-color-fields',
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
    <div class="section-controls">
      <app-select-field
        label="Color layout"
        [field]="form().mode"
        [options]="[
          ['ribs', 'Marks on ribs'],
          ['panels', 'Cuts by panel'],
        ]"
      />
    </div>
    @if (form().mode().value() === 'ribs') {
      <app-record-editor [form]="form().ribs" label="Color rib" [summary]="ribSummary"
        ><ng-template [appRecordFields]="form().ribs" let-rib let-i="index">
          <fieldset>
            <legend>Color rib {{ i + 1 }}</legend>
            <app-number-field
              label="Rib number"
              hint="Rib carrying these color marks."
              integer
              [field]="rib.rib"
            />
            <div appTableScroll role="region" aria-label="Color marks">
              <table class="parameter-table">
                <caption>
                  Color marks
                </caption>
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Mark number</th>
                    <th scope="col">First position (% chord)</th>
                    <th scope="col">Second position (% chord)</th>
                    <th scope="col" class="row-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  @for (mark of rib.marks; track mark; let j = $index) {
                    <tr [appRecordRow]="rib.marks" [index]="j">
                      <th scope="row">{{ j + 1 }}</th>
                      <td>
                        <app-number-field
                          compact
                          label="Mark number"
                          hint="Mark identifier."
                          integer
                          [field]="mark.number"
                        />
                      </td>
                      <td>
                        <app-number-field
                          compact
                          label="First position"
                          unit="% chord"
                          hint="First end of the mark."
                          [field]="mark.positions[0]"
                        />
                      </td>
                      <td>
                        <app-number-field
                          compact
                          label="Second position"
                          unit="% chord"
                          hint="Second end of the mark."
                          [field]="mark.positions[1]"
                        />
                      </td>
                      <td class="row-actions">
                        <app-remove-row [rows]="rib.marks" [index]="j" label="color mark" />
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <app-add-row
              label="color mark"
              [rows]="rib.marks"
              [max]="100"
              [row]="{ number: rib.marks.length + 1, positions: [0, 0] }"
            />
          </fieldset> </ng-template
      ></app-record-editor>
      <app-add-row
        label="color rib"
        [rows]="form().ribs"
        [max]="100"
        [row]="{ rib: 1, marks: [] }"
      />
    } @else {
      <app-record-editor [form]="form().panels" label="Color panel" [summary]="panelSummary"
        ><ng-template [appRecordFields]="form().panels" let-panel let-i="index">
          <fieldset>
            <legend>Color panel {{ i + 1 }}</legend>
            <app-number-field
              label="Panel number"
              hint="Panel between ribs panel − 1 and panel."
              integer
              [field]="panel.panel"
            />
            <div appTableScroll role="region" aria-label="Panel cuts">
              <table class="parameter-table">
                <caption>
                  Panel cuts
                </caption>
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Cut number</th>
                    <th scope="col">Left end (% chord)</th>
                    <th scope="col">Right end (% chord)</th>
                    <th scope="col">Cut seam width (mm)</th>
                    <th scope="col">Unused parameter</th>
                    <th scope="col" class="row-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  @for (cut of panel.cuts; track cut; let j = $index) {
                    <tr [appRecordRow]="panel.cuts" [index]="j">
                      <th scope="row">{{ j + 1 }}</th>
                      <td>
                        <app-number-field
                          compact
                          label="Cut number"
                          hint="Cut identifier."
                          integer
                          [field]="cut.number"
                        />
                      </td>
                      <td>
                        <app-number-field
                          compact
                          label="Left end"
                          unit="% chord"
                          hint="Distance from the trailing edge."
                          [field]="cut.left"
                        />
                      </td>
                      <td>
                        <app-number-field
                          compact
                          label="Right end"
                          unit="% chord"
                          hint="Distance from the trailing edge."
                          [field]="cut.right"
                        />
                      </td>
                      <td>
                        <app-number-field
                          compact
                          label="Cut seam width"
                          unit="mm"
                          hint="Seam allowance for this cut."
                          [field]="cut.seamWidth"
                        />
                      </td>
                      <td>
                        <app-number-field
                          compact
                          label="Unused parameter"
                          hint="Usually 0; unused by 3.29."
                          [field]="cut.unused"
                        />
                      </td>
                      <td class="row-actions">
                        <app-remove-row [rows]="panel.cuts" [index]="j" label="panel cut" />
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <app-add-row
              label="panel cut"
              [rows]="panel.cuts"
              [max]="100"
              [row]="{ number: panel.cuts.length + 1, left: 0, right: 0, seamWidth: 0, unused: 0 }"
            />
          </fieldset> </ng-template
      ></app-record-editor>
      <app-add-row
        label="color panel"
        [rows]="form().panels"
        [max]="100"
        [row]="{ panel: 1, cuts: [] }"
      />
    }
  `,
  styleUrl: './section.css',
})
export class ColorFields {
  readonly form = input.required<EditorForm['extradosColors']>();
  protected readonly editor = inject(EditorState);
  protected readonly ribSummary = (row: DesignForm['extradosColors']['ribs'][number]) =>
    `Rib ${row.rib} · ${row.marks.length} marks`;
  protected readonly panelSummary = (row: DesignForm['extradosColors']['panels'][number]) =>
    `Panel ${row.panel} · ${row.cuts.length} cuts`;
}
