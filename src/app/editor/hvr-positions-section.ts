import { Component, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { EditorState } from './editor-state';
import { NumberField } from './number-field';
import { SelectField } from './select-field';
import { TableScroll } from './table-scroll';

@Component({
  selector: 'app-hvr-positions-section',
  imports: [MatButton, NumberField, SelectField, TableScroll],
  template: `
    <div class="section-controls">
      <app-select-field
        label="HVR positions mode"
        [field]="form.mode"
        [options]="[
          [0, 'Initialize standard factors'],
          [1, 'Custom factors'],
        ]"
      />
    </div>
    @if (editor.form.hvrHoles.mode().value() === 1) {
      <div appTableScroll role="region" aria-label="V-rib separation factors">
        <table class="parameter-table">
          <caption>
            V-rib separation factors
          </caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Horizontal factor</th>
              <th scope="col">Vertical factor</th>
            </tr>
          </thead>
          <tbody>
            @for (row of form.coefficients; track row; let i = $index) {
              <tr>
                <th scope="row">{{ i + 1 }}</th>
                <td>
                  <app-number-field compact label="Horizontal factor" [field]="row.horizontal" />
                </td>
                <td>
                  <app-number-field compact label="Vertical factor" [field]="row.vertical" />
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <p>The engine reads these factors only when section 38 is enabled.</p>
      <button matButton type="button" (click)="editor.select(38)">View Section 38</button>
    }
  `,
  styleUrl: './section.css',
})
export class HvrPositionsSection {
  protected readonly editor = inject(EditorState);
  protected readonly form = this.editor.form.hvrPositions;
}
