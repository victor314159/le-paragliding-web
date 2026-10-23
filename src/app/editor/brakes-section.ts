import { Component, inject } from '@angular/core';
import { FormField } from '@angular/forms/signals';
import { MatCheckbox } from '@angular/material/checkbox';
import { EditorState } from './editor-state';
import { LinePaths } from './line-paths';
import { NumberField } from './number-field';
import { TableScroll } from './table-scroll';

@Component({
  selector: 'app-brakes-section',
  imports: [FormField, LinePaths, MatCheckbox, NumberField, TableScroll],
  template: `
    <fieldset>
      <legend>Brake settings</legend>
      <app-number-field label="Main brake length" unit="cm" [field]="form.length" />
      <mat-checkbox [formField]="form.typed">Include line types from section 34</mat-checkbox>
      @for (error of form.typed().errors(); track $index) {
        <p class="mat-text-error">{{ error.message }}</p>
      }
    </fieldset>
    <app-line-paths [form]="form.paths" [typed]="form.typed().value()" brake />
    <div appTableScroll role="region" aria-label="Brake distribution">
      <table class="parameter-table">
        <caption>
          Brake distribution
        </caption>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Span (%)</th>
            <th scope="col">Length increment (cm)</th>
          </tr>
        </thead>
        <tbody>
          @for (span of form.distributionSpans; track span; let i = $index) {
            <tr>
              <th scope="row">{{ i + 1 }}</th>
              <td>
                <app-number-field compact [label]="'Span ' + (i + 1)" unit="%" [field]="span" />
              </td>
              <td>
                <app-number-field
                  compact
                  [label]="'Length increment ' + (i + 1)"
                  unit="cm"
                  [field]="form.distributionIncrements[i]"
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
export class BrakesSection {
  protected readonly editor = inject(EditorState);
  protected readonly form = this.editor.form.brakes;
}
