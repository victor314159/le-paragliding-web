import { Component, inject } from '@angular/core';
import { EditorState } from './editor-state';
import { NumberField } from './number-field';
import { AddRow, RecordRow, RemoveRow } from './record-editor';
import { TableScroll } from './table-scroll';

@Component({
  selector: 'app-anchors-section',
  imports: [AddRow, NumberField, RecordRow, RemoveRow, TableScroll],
  template: `
    <p>One row per rib of the half wing. Positions A–E are suspension anchors; F is the brake.</p>
    <div appTableScroll role="region" aria-label="Anchor positions">
      <table class="parameter-table">
        <caption>
          Anchor positions
        </caption>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Rib number</th>
            <th scope="col">Anchor count</th>
            <th scope="col">A position (% chord)</th>
            <th scope="col">B position (% chord)</th>
            <th scope="col">C position (% chord)</th>
            <th scope="col">D position (% chord)</th>
            <th scope="col">E position (% chord)</th>
            <th scope="col">F position (% chord)</th>
            <th scope="col" class="row-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          @for (rib of form; track rib; let i = $index) {
            <tr [appRecordRow]="form" [index]="i">
              <th scope="row">{{ i + 1 }}</th>
              <td><app-number-field compact label="Rib number" [field]="rib.number" /></td>
              <td>
                <app-number-field
                  compact
                  label="Anchor count"
                  hint="Number of A–E anchors on this rib."
                  [field]="rib.count"
                />
              </td>
              <td>
                <app-number-field
                  compact
                  label="A position"
                  unit="% chord"
                  [field]="rib.positions[0]"
                />
              </td>
              <td>
                <app-number-field
                  compact
                  label="B position"
                  unit="% chord"
                  [field]="rib.positions[1]"
                />
              </td>
              <td>
                <app-number-field
                  compact
                  label="C position"
                  unit="% chord"
                  [field]="rib.positions[2]"
                />
              </td>
              <td>
                <app-number-field
                  compact
                  label="D position"
                  unit="% chord"
                  [field]="rib.positions[3]"
                />
              </td>
              <td>
                <app-number-field
                  compact
                  label="E position"
                  unit="% chord"
                  [field]="rib.positions[4]"
                />
              </td>
              <td>
                <app-number-field
                  compact
                  label="F position"
                  unit="% chord"
                  [field]="rib.positions[5]"
                />
              </td>
              <td class="row-actions">
                <app-remove-row [rows]="form" [index]="i" label="anchor row" />
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
    <app-add-row
      label="anchor row"
      [rows]="form"
      [max]="100"
      [row]="{ number: form.length + 1, count: 1, positions: [0, 0, 0, 0, 0, 0] }"
    />
  `,
  styleUrl: './section.css',
})
export class AnchorsSection {
  protected readonly editor = inject(EditorState);
  protected readonly form = this.editor.form.anchors;
}
