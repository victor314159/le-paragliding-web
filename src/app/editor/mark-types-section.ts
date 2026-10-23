import { Component, inject } from '@angular/core';
import { EditorState } from './editor-state';
import { NumberField } from './number-field';
import { AddRow, RecordRow, RemoveRow } from './record-editor';
import { TableScroll } from './table-scroll';

@Component({
  selector: 'app-mark-types-section',
  imports: [AddRow, NumberField, RecordRow, RemoveRow, TableScroll],
  template: `
    <p>The engine uses the first ten mark types, in file order.</p>
    <div appTableScroll role="region" aria-label="Print and laser marks">
      <table class="parameter-table">
        <caption>
          Print and laser marks
        </caption>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Print form</th>
            <th scope="col">Print size (mm) / position</th>
            <th scope="col">Print offset (mm) / height (cm)</th>
            <th scope="col">Laser form</th>
            <th scope="col">Laser size (mm)</th>
            <th scope="col">Laser offset (mm)</th>
            <th scope="col" class="row-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          @for (mark of form; track mark; let i = $index) {
            <tr [appRecordRow]="form" [index]="i">
              <th scope="row">{{ i + 1 }}</th>
              <td>
                <app-number-field
                  compact
                  label="Print form"
                  integer
                  [field]="mark.print.type"
                  (focusin)="editor.setPreviewView(20, 'print')"
                />
              </td>
              <td>
                <app-number-field
                  compact
                  [label]="i === 7 ? 'Numeral position fraction' : 'Print size'"
                  [unit]="i === 7 ? '' : 'mm'"
                  [field]="mark.print.size"
                  (focusin)="editor.setPreviewView(20, 'print')"
                />
              </td>
              <td>
                <app-number-field
                  compact
                  [label]="i === 8 || i === 9 ? 'Number height' : 'Print offset'"
                  [unit]="i === 8 || i === 9 ? 'cm' : 'mm'"
                  [field]="mark.print.offset"
                  (focusin)="editor.setPreviewView(20, 'print')"
                />
              </td>
              <td>
                <app-number-field
                  compact
                  label="Laser form"
                  integer
                  [field]="mark.laser.type"
                  (focusin)="editor.setPreviewView(20, 'laser')"
                />
              </td>
              <td>
                <app-number-field
                  compact
                  label="Laser size"
                  unit="mm"
                  [field]="mark.laser.size"
                  (focusin)="editor.setPreviewView(20, 'laser')"
                />
              </td>
              <td>
                <app-number-field
                  compact
                  label="Laser offset"
                  unit="mm"
                  [field]="mark.laser.offset"
                  (focusin)="editor.setPreviewView(20, 'laser')"
                />
              </td>
              <td class="row-actions">
                <app-remove-row [rows]="form" [index]="i" label="mark type" />
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
    <app-add-row
      label="mark type"
      [rows]="form"
      [max]="50"
      [row]="{ print: { type: 1, size: 0, offset: 0 }, laser: { type: 1, size: 0, offset: 0 } }"
    />
  `,
  styleUrl: './section.css',
})
export class MarkTypesSection {
  protected readonly editor = inject(EditorState);
  protected readonly form = this.editor.form.markTypes;
}
