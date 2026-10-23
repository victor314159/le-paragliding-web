import { booleanAttribute, Component, inject, input } from '@angular/core';
import { type DesignForm, type EditorForm, linePath } from './editor-draft';
import { EditorState } from './editor-state';
import { NumberField } from './number-field';
import { AddRow, RecordEditor, RecordFields } from './record-editor';
import { SelectField } from './select-field';
import { TableScroll } from './table-scroll';

/** The common path matrix in sections 9 and 10, including optional line types. */
@Component({
  selector: 'app-line-paths',
  imports: [AddRow, NumberField, RecordEditor, RecordFields, SelectField, TableScroll],
  template: `
    <app-record-editor [form]="form()" label="Path" [summary]="pathSummary"
      ><ng-template [appRecordFields]="form()" let-path let-i="index">
        <fieldset>
          <legend>Path {{ i + 1 }}</legend>
          <app-number-field
            label="Branching levels"
            hint="1–4; typed paths need 2–4. Untyped suspension paths also support 5."
            integer
            [field]="path.levels"
          />
          <app-select-field
            label="Anchor row"
            [field]="path.anchorRow"
            [options]="[
              [1, 'A'],
              [2, 'B'],
              [3, 'C'],
              [4, 'D'],
              [5, 'E'],
              [6, 'F · brake'],
            ]"
          />
          <app-number-field
            label="Anchor rib"
            [hint]="
              brake()
                ? 'Fractional ribs interpolate brake anchors, e.g. 8.4.'
                : 'Rib number in section 3.'
            "
            [integer]="!brake()"
            [field]="path.anchorRib"
          />
          <div appTableScroll role="region" aria-label="Path branches">
            <table class="parameter-table">
              <caption>
                Branches · unused pairs are 0, 0
              </caption>
              <thead>
                <tr>
                  <th scope="col">Branch</th>
                  <th scope="col">Level</th>
                  <th scope="col">Order</th>
                  @if (typed()) {
                    <th scope="col">Line type</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (branch of path.branches; track branch; let k = $index) {
                  @if (k < 4 || (!brake() && path.levels().value() === 5)) {
                    <tr>
                      <th scope="row">{{ k + 1 }}</th>
                      <td>
                        <app-number-field
                          compact
                          [label]="'Branch ' + (k + 1) + ' level'"
                          hint="The branch level, or 0 for an unused pair."
                          integer
                          [field]="branch[0]"
                        />
                      </td>
                      <td>
                        <app-number-field
                          compact
                          [label]="'Branch ' + (k + 1) + ' order'"
                          hint="The line order, or 0 for an unused pair."
                          integer
                          [field]="branch[1]"
                        />
                      </td>
                      @if (typed()) {
                        <td>
                          @if (k < (path.levels().value() ?? 0)) {
                            <app-number-field
                              compact
                              [label]="'Branch ' + (k + 1) + ' line type'"
                              hint="Type number from section 34."
                              integer
                              [field]="path.lineTypes[k]"
                            />
                          } @else {
                            —
                          }
                        </td>
                      }
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>
        </fieldset>
      </ng-template></app-record-editor
    >
    <app-add-row label="path" [rows]="form()" [max]="100" [row]="newPath(brake())" />
  `,
  styleUrl: './section.css',
})
export class LinePaths {
  readonly form = input.required<EditorForm['lines']['plans'][number]['paths']>();
  readonly typed = input.required<boolean>();
  readonly brake = input(false, { transform: booleanAttribute });
  protected readonly editor = inject(EditorState);
  protected readonly newPath = linePath;
  protected readonly pathSummary = (row: DesignForm['lines']['plans'][number]['paths'][number]) => {
    const branches = row.branches.slice(0, row.levels ?? 0).map((branch) => branch.join(':'));
    return `Anchor ${row.anchorRow} · rib ${row.anchorRib} · ${row.levels} levels · ${branches.join(' → ')}`;
  };
}
