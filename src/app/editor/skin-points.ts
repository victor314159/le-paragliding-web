import { booleanAttribute, Component, inject, input } from '@angular/core';
import { type EditorForm, skinPoint } from './editor-draft';
import { EditorState } from './editor-state';
import { NumberField } from './number-field';
import { AddRow, RecordRow, RemoveRow } from './record-editor';
import { TableScroll } from './table-scroll';

/** The same overwidth coordinates in sections 5 and 31. */
@Component({
  selector: 'app-skin-points',
  imports: [AddRow, NumberField, RecordRow, RemoveRow, TableScroll],
  template: `
    <div appTableScroll role="region" aria-label="Skin overwidths">
      <table class="parameter-table">
        <caption>
          Skin overwidths
        </caption>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Extrados position (% chord)</th>
            <th scope="col">Extrados overwidth (% chord)</th>
            <th scope="col">Intrados position (% chord)</th>
            <th scope="col">Intrados overwidth (% chord)</th>
            @if (editable()) {
              <th scope="col" class="row-actions">Actions</th>
            }
          </tr>
        </thead>
        <tbody>
          @for (point of form(); track point; let i = $index) {
            <tr [appRecordRow]="form()" [index]="i">
              <th scope="row">{{ i + 1 }}</th>
              <td>
                <app-number-field
                  compact
                  label="Extrados position"
                  unit="% chord"
                  hint="Distance from the leading edge."
                  [field]="point.extradosPosition"
                />
              </td>
              <td>
                <app-number-field
                  compact
                  label="Extrados overwidth"
                  unit="% chord"
                  hint="Extra width at this position."
                  [field]="point.extradosOverwidth"
                />
              </td>
              <td>
                <app-number-field
                  compact
                  label="Intrados position"
                  unit="% chord"
                  hint="Distance from the trailing edge."
                  [field]="point.intradosPosition"
                />
              </td>
              <td>
                <app-number-field
                  compact
                  label="Intrados overwidth"
                  unit="% chord"
                  hint="Extra width at this position."
                  [field]="point.intradosOverwidth"
                />
              </td>
              @if (editable()) {
                <td class="row-actions">
                  <app-remove-row [rows]="form()" [index]="i" label="overwidth point" />
                </td>
              }
            </tr>
          }
        </tbody>
      </table>
    </div>
    @if (editable()) {
      <app-add-row label="overwidth point" [rows]="form()" [max]="100" [row]="newPoint()" />
    }
  `,
  styleUrl: './section.css',
})
export class SkinPoints {
  readonly form = input.required<EditorForm['skinTensionGroups']['groups'][number]['points']>();
  readonly editable = input(false, { transform: booleanAttribute });
  protected readonly editor = inject(EditorState);
  protected readonly newPoint = skinPoint;
}
