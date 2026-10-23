import { Component, inject } from '@angular/core';
import { type DesignForm, rodGroup } from './editor-draft';
import { EditorState } from './editor-state';
import { NumberField } from './number-field';
import { AddRow, RecordEditor, RecordFields, ribRange } from './record-editor';
import { RodFields } from './rod-fields';
import { SelectField } from './select-field';

@Component({
  selector: 'app-joncs-section',
  imports: [AddRow, NumberField, RecordEditor, RecordFields, RodFields, SelectField],
  template: `
    <div class="section-controls">
      <app-select-field
        label="Nylon rods mode"
        [field]="form.mode"
        [options]="[
          [0, 'Disabled'],
          [1, 'Classic nose rods'],
          [2, 'Multiple rod blocs'],
        ]"
      />
    </div>
    @if (form.mode().value() === 1) {
      <app-record-editor [form]="form.groups" label="Rod group" [summary]="groupSummary"
        ><ng-template [appRecordFields]="form.groups" let-group let-i="index">
          <fieldset>
            <legend>Rod group {{ i + 1 }}</legend>
            <app-rod-fields [form]="group" [type]="1" />
          </fieldset> </ng-template
      ></app-record-editor>
      <app-add-row
        label="rod group"
        [rows]="form.groups"
        [max]="100"
        [row]="newGroup(form.groups.length + 1)"
      />
    }
    @if (form.mode().value() === 2) {
      <app-record-editor [form]="form.blocs" label="Rod bloc" [summary]="blocSummary"
        ><ng-template [appRecordFields]="form.blocs" let-bloc let-i="index">
          <fieldset>
            <legend>Rod bloc {{ i + 1 }}</legend>
            <app-number-field label="Bloc number" integer [field]="bloc.number" />
            <app-select-field
              label="Rod type"
              [field]="bloc.type"
              [options]="[
                [1, 'Nose rod'],
                [2, 'Arc or straight rod'],
                [3, 'Shark nose'],
                [4, 'Long extrados rod'],
                [5, 'Long intrados rod'],
              ]"
            />
            <app-record-editor [form]="bloc.groups" label="Rod group" [summary]="groupSummary"
              ><ng-template [appRecordFields]="bloc.groups" let-group let-g="index">
                <fieldset>
                  <legend>Rod group {{ g + 1 }}</legend>
                  <app-rod-fields [form]="group" [type]="bloc.type().value()" />
                </fieldset> </ng-template
            ></app-record-editor>
            <app-add-row
              label="rod group"
              [rows]="bloc.groups"
              [max]="100"
              [row]="newGroup(bloc.groups.length + 1)"
            />
          </fieldset> </ng-template
      ></app-record-editor>
      <app-add-row
        label="rod bloc"
        [rows]="form.blocs"
        [max]="20"
        [row]="{ number: form.blocs.length + 1, type: 1, groups: [] }"
      />
    }
  `,
  styleUrl: './section.css',
})
export class JoncsSection {
  protected readonly editor = inject(EditorState);
  protected readonly form = this.editor.form.joncs;
  protected readonly newGroup = rodGroup;
  protected readonly groupSummary = ribRange;
  protected readonly blocSummary = (row: DesignForm['joncs']['blocs'][number]) =>
    `Type ${row.type} · ${row.groups.length} groups`;
}
