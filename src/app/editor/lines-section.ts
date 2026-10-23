import { Component, inject } from '@angular/core';
import { FormField } from '@angular/forms/signals';
import { MatCheckbox } from '@angular/material/checkbox';
import type { DesignForm } from './editor-draft';
import { EditorState } from './editor-state';
import { LinePaths } from './line-paths';
import { AddRow, RecordEditor, RecordFields } from './record-editor';
import { SelectField } from './select-field';

@Component({
  selector: 'app-lines-section',
  imports: [AddRow, FormField, LinePaths, MatCheckbox, RecordEditor, RecordFields, SelectField],
  template: `
    <fieldset>
      <legend>Line settings</legend>
      <app-select-field
        label="Branch placement"
        [field]="form.weighting"
        [options]="[
          [0, 'Geometric mean'],
          [1, 'Weighted method 1'],
          [2, 'Weighted method 2'],
          [3, 'Optimized'],
        ]"
      />
      <mat-checkbox [formField]="form.typed">Include line types from section 34</mat-checkbox>
      @for (error of form.typed().errors(); track $index) {
        <p class="mat-text-error">{{ error.message }}</p>
      }
    </fieldset>
    <app-record-editor [form]="form.plans" label="Line plan" [summary]="planSummary"
      ><ng-template [appRecordFields]="form.plans" let-plan let-i="index">
        <fieldset>
          <legend>Line plan {{ i + 1 }}</legend>
          <app-line-paths [form]="plan.paths" [typed]="form.typed().value()" />
        </fieldset> </ng-template
    ></app-record-editor>
    <app-add-row label="line plan" [rows]="form.plans" [max]="9" [row]="{ paths: [] }" />
  `,
  styleUrl: './section.css',
})
export class LinesSection {
  protected readonly editor = inject(EditorState);
  protected readonly form = this.editor.form.lines;
  protected readonly planSummary = (row: DesignForm['lines']['plans'][number], index: number) =>
    `Plan ${index + 1} · ${row.paths.length} paths`;
}
