import { Component, inject } from '@angular/core';
import type { DesignForm } from './editor-draft';
import { EditorState } from './editor-state';
import { NumberField } from './number-field';
import { TableScroll } from './table-scroll';
import {
  AddRow,
  RecordEditor,
  RecordFields,
  RecordRow,
  RemoveRow,
  ribRange,
} from './record-editor';
import { SelectField } from './select-field';

@Component({
  selector: 'app-shaping-section',
  imports: [
    AddRow,
    NumberField,
    RecordEditor,
    RecordFields,
    RecordRow,
    RemoveRow,
    SelectField,
    TableScroll,
  ],
  template: `
    <div class="section-controls">
      <app-select-field
        label="3D shaping mode"
        [field]="form.mode"
        [options]="[
          [0, 'Disabled'],
          [1, 'Airfoil point cuts'],
          [2, 'Legacy mode; cut points ignored'],
        ]"
      />
    </div>
    @if (form.mode().value() !== 0) {
      <fieldset>
        <legend>Shaping settings</legend>
        <app-number-field
          label="Shaping model"
          hint="Documented model: 1."
          integer
          [field]="form.model"
        />
      </fieldset>
      <app-record-editor [form]="form.groups" label="Shaping group" [summary]="groupSummary"
        ><ng-template [appRecordFields]="form.groups" let-group let-i="index">
          <fieldset>
            <legend>Shaping group {{ i + 1 }}</legend>
            <app-number-field label="Group number" integer [field]="group.group" />
            <app-number-field label="First rib" integer [field]="group.firstRib" />
            <app-number-field label="Last rib" integer [field]="group.lastRib" />
            @for (surface of surfaces; track surface.key) {
              @let cuts = group[surface.key].cuts;
              <fieldset>
                <legend>{{ surface.label }} surface</legend>
                <app-number-field
                  [label]="surface.label + ' subtype'"
                  integer
                  [field]="group[surface.key].type"
                />
                <div
                  appTableScroll
                  role="region"
                  [attr.aria-label]="surface.label + ' shaping cuts'"
                >
                  <table class="parameter-table">
                    <caption>
                      {{
                        surface.label + ' shaping cuts'
                      }}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">#</th>
                        <th scope="col">Cut number</th>
                        <th scope="col">Start airfoil point</th>
                        <th scope="col">End airfoil point</th>
                        <th scope="col">Depth coefficient</th>
                        <th scope="col" class="row-actions">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (cut of cuts; track cut; let c = $index) {
                        <tr
                          [appRecordRow]="cuts"
                          [index]="c"
                          (focusin)="editor.shapingSurface.set(surface.key)"
                        >
                          <th scope="row">{{ c + 1 }}</th>
                          <td>
                            <app-number-field
                              compact
                              label="Cut number"
                              integer
                              [field]="cut.number"
                            />
                          </td>
                          <td>
                            <app-number-field
                              compact
                              label="Start airfoil point"
                              integer
                              [field]="cut.start"
                            />
                          </td>
                          <td>
                            <app-number-field
                              compact
                              label="End airfoil point"
                              integer
                              [field]="cut.end"
                            />
                          </td>
                          <td>
                            <app-number-field
                              compact
                              label="Depth coefficient"
                              hint="Typically around ±1."
                              [field]="cut.depth"
                            />
                          </td>
                          <td class="row-actions">
                            <app-remove-row
                              [rows]="cuts"
                              [index]="c"
                              [label]="surface.key + ' cut'"
                            />
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
                <app-add-row
                  [label]="surface.key + ' cut'"
                  [rows]="cuts"
                  [max]="surface.max"
                  [row]="{ number: cuts.length + 1, start: 1, end: 2, depth: 0 }"
                />
              </fieldset>
            }
          </fieldset> </ng-template
      ></app-record-editor>
      <app-add-row
        label="shaping group"
        [rows]="form.groups"
        [max]="200"
        [row]="{
          group: form.groups.length + 1,
          firstRib: 1,
          lastRib: 1,
          upper: { type: 1, cuts: [] },
          lower: { type: 1, cuts: [] },
        }"
      />
      @for (output of outputs; track output.key) {
        @let print = form.print[output.key];
        <fieldset>
          <legend>{{ output.label }}</legend>
          <app-select-field
            [label]="output.label + ' output'"
            [field]="print.draw"
            [options]="[
              [0, 'Hidden'],
              [1, 'Drawn'],
            ]"
          />
          <app-number-field [label]="output.label + ' first'" integer [field]="print.first" />
          <app-number-field [label]="output.label + ' last'" integer [field]="print.last" />
          <app-select-field
            [label]="output.label + ' symmetry'"
            [field]="print.oneSide"
            [options]="[
              [0, 'Symmetric'],
              [1, 'One side'],
            ]"
          />
        </fieldset>
      }
    }
  `,
  styleUrl: './section.css',
})
export class ShapingSection {
  protected readonly editor = inject(EditorState);
  protected readonly form = this.editor.form.shaping;
  protected readonly surfaces = [
    { key: 'upper', label: 'Upper', max: 2 },
    { key: 'lower', label: 'Lower', max: 1 },
  ] as const;
  protected readonly outputs = [
    { key: 'interpolation', label: 'Interpolation' },
    { key: 'ovalization', label: 'Ovalization' },
    { key: 'tessellation', label: 'Tessellation' },
    { key: 'dxf', label: 'DXF' },
    { key: 'stl', label: 'STL' },
  ] as const;
  protected readonly groupSummary = (row: DesignForm['shaping']['groups'][number]) =>
    `${ribRange(row)} · ${row.upper.cuts.length} upper / ${row.lower.cuts.length} lower cuts`;
}
