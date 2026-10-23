import { Component, inject } from '@angular/core';
import type { DesignForm } from './editor-draft';
import { EditorState } from './editor-state';
import { AddRow, RecordEditor, RecordFields } from './record-editor';
import { SelectField } from './select-field';
import { SpecialEntryFields } from './special-entry';

@Component({
  selector: 'app-special-parameters-section',
  imports: [AddRow, RecordEditor, RecordFields, SelectField, SpecialEntryFields],
  template: `
    <div class="section-controls">
      <app-select-field
        label="Special parameters mode"
        [field]="form.mode"
        [options]="[
          [0, 'Disabled'],
          [1, 'Enabled'],
        ]"
      />
    </div>
    @if (form.mode().value() !== 0) {
      <app-record-editor [form]="form.entries" label="Special parameter" [summary]="entrySummary"
        ><ng-template [appRecordFields]="form.entries" let-entry let-i="index">
          <fieldset>
            <legend>Special parameter {{ i + 1 }}</legend>
            <app-special-entry [form]="entry" />
          </fieldset> </ng-template
      ></app-record-editor>
      <app-add-row
        label="special parameter"
        [rows]="form.entries"
        [max]="250"
        [row]="{
          code: 1341,
          value: 0,
          numberValue: 0,
          textValue: '',
          transition: 1,
          values: [0, 0],
        }"
      />
    }
  `,
  styleUrl: './section.css',
})
export class SpecialParametersSection {
  protected readonly editor = inject(EditorState);
  protected readonly form = this.editor.form.specialParameters;
  protected readonly entrySummary = (row: DesignForm['specialParameters']['entries'][number]) =>
    `${row.code} · ${row.code === 3001 ? `${row.transition} / ${row.values.join(', ')}` : row.value}`;
}
