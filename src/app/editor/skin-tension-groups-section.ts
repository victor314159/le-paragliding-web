import { Component, inject } from '@angular/core';
import { type DesignForm, skinPoint } from './editor-draft';
import { EditorState } from './editor-state';
import { NumberField } from './number-field';
import { AddRow, RecordEditor, RecordFields, ribRange } from './record-editor';
import { SelectField } from './select-field';
import { SkinPoints } from './skin-points';

@Component({
  selector: 'app-skin-tension-groups-section',
  imports: [AddRow, NumberField, RecordEditor, RecordFields, SelectField, SkinPoints],
  template: `
    <div class="section-controls">
      <app-select-field
        label="Skin tension groups mode"
        [field]="form.mode"
        [options]="[
          [0, 'Disabled'],
          [1, 'Enabled'],
        ]"
      />
    </div>
    @if (form.mode().value() !== 0) {
      <app-record-editor [form]="form.groups" label="Skin tension group" [summary]="groupSummary"
        ><ng-template [appRecordFields]="form.groups" let-group let-i="index">
          <fieldset>
            <legend>Skin tension group {{ i + 1 }}</legend>
            <app-number-field label="Group number" integer [field]="group.group" />
            <app-number-field label="First rib" integer [field]="group.firstRib" />
            <app-number-field label="Last rib" integer [field]="group.lastRib" />
            <app-select-field
              label="Interpolation type"
              [field]="group.type"
              [options]="[[1, 'Linear']]"
            />
            <app-skin-points [form]="group.points" editable />
          </fieldset> </ng-template
      ></app-record-editor>
      <app-add-row
        label="skin tension group"
        [rows]="form.groups"
        [row]="{
          group: form.groups.length + 1,
          firstRib: 1,
          lastRib: editor.form.geometry.ribs.length,
          type: 1,
          points: [newPoint(), newPoint()],
        }"
      />
    }
  `,
  styleUrl: './section.css',
})
export class SkinTensionGroupsSection {
  protected readonly editor = inject(EditorState);
  protected readonly form = this.editor.form.skinTensionGroups;
  protected readonly newPoint = skinPoint;
  protected readonly groupSummary = (row: DesignForm['skinTensionGroups']['groups'][number]) =>
    `${ribRange(row)} · ${row.points.length} overwidth points`;
}
