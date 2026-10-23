import { Component, inject } from '@angular/core';
import { EditorState } from './editor-state';
import { NumberField } from './number-field';
import { TableScroll } from './table-scroll';

@Component({
  selector: 'app-elastic-lines-section',
  imports: [NumberField, TableScroll],
  template: `
    <fieldset>
      <legend>Flight load</legend>
      <app-number-field label="Flight load" unit="kg" [field]="form.flightLoad" />
    </fieldset>
    <div appTableScroll role="region" aria-label="Flight load distribution">
      <table class="parameter-table">
        <caption>
          Flight load distribution (%)
        </caption>
        <thead>
          <tr>
            <th scope="col">Lines per rib</th>
            @for (j of [0, 1, 2, 3, 4]; track j) {
              <th scope="col">Line {{ j + 1 }}</th>
            }
          </tr>
        </thead>
        <tbody>
          @for (distribution of form.distribution; track distribution; let i = $index) {
            <tr>
              <th scope="row">{{ i + 2 }}</th>
              @for (j of [0, 1, 2, 3, 4]; track j) {
                <td>
                  @if (j < distribution.length) {
                    <app-number-field
                      compact
                      [label]="'Line ' + (j + 1) + ' load'"
                      unit="%"
                      hint="Share of the flight load."
                      [field]="distribution[j]"
                    />
                  } @else {
                    —
                  }
                </td>
              }
            </tr>
          }
        </tbody>
      </table>
    </div>
    <div appTableScroll role="region" aria-label="Deformation under 10 kg">
      <table class="parameter-table">
        <caption>
          Deformation under 10 kg
        </caption>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Lines per rib</th>
            <th scope="col">Lower level deformation (%)</th>
            <th scope="col">Middle level deformation (%)</th>
            <th scope="col">Higher level deformation (%)</th>
          </tr>
        </thead>
        <tbody>
          @for (row of form.deformation; track row; let i = $index) {
            <tr>
              <th scope="row">{{ i + 1 }}</th>
              <td>
                <app-number-field compact label="Lines per rib" [field]="row.lines" />
              </td>
              <td>
                <app-number-field
                  compact
                  label="Lower level deformation"
                  unit="%"
                  [field]="row.lower"
                />
              </td>
              <td>
                <app-number-field
                  compact
                  label="Middle level deformation"
                  unit="%"
                  [field]="row.medium"
                />
              </td>
              <td>
                <app-number-field
                  compact
                  label="Higher level deformation"
                  unit="%"
                  [field]="row.higher"
                />
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styleUrl: './section.css',
})
export class ElasticLinesSection {
  protected readonly editor = inject(EditorState);
  protected readonly form = this.editor.form.elasticLines;
}
