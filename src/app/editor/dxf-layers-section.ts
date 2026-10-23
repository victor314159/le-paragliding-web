import { Component, inject } from '@angular/core';
import { EditorState } from './editor-state';
import { AddRow, RecordRow, RemoveRow } from './record-editor';
import { TableScroll } from './table-scroll';
import { TextField } from './text-field';

@Component({
  selector: 'app-dxf-layers-section',
  imports: [AddRow, RecordRow, RemoveRow, TableScroll, TextField],
  template: `
    <p>Layer names are read but unused by the 3.29 engine.</p>
    <div appTableScroll role="region" aria-label="DXF layers">
      <table class="parameter-table">
        <caption>
          DXF layers
        </caption>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Layer name</th>
            <th scope="col" class="row-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          @for (layer of form; track layer; let i = $index) {
            <tr [appRecordRow]="form" [index]="i">
              <th scope="row">{{ i + 1 }}</th>
              <td>
                <app-text-field
                  compact
                  label="Layer name"
                  hint="Up to 50 UTF-8 bytes."
                  [field]="layer"
                />
              </td>
              <td class="row-actions">
                <app-remove-row [rows]="form" [index]="i" label="layer" />
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
    <app-add-row label="layer" [rows]="form" [max]="50" [row]="'Layer'" />
  `,
  styleUrl: './section.css',
})
export class DxfLayersSection {
  protected readonly editor = inject(EditorState);
  protected readonly form = this.editor.form.dxfLayers;
}
