import { Component, computed, inject } from '@angular/core';
import { EditorState } from './editor-state';
import { NumberField } from './number-field';
import { AddRow, RecordRow, RemoveRow } from './record-editor';
import { SelectField } from './select-field';
import { TableScroll } from './table-scroll';

@Component({
  selector: 'app-hv-ribs-section',
  imports: [AddRow, NumberField, RecordRow, RemoveRow, SelectField, TableScroll],
  template: `
    <fieldset>
      <legend>Drawing layout</legend>
      <app-number-field
        label="Horizontal drawing separation"
        unit="cm"
        [field]="form.separationX"
      />
      <app-number-field label="Vertical drawing separation" unit="cm" [field]="form.separationY" />
    </fieldset>
    <p>
      Parameter columns use the input file numbering. Their meaning depends on the rib type; see the
      section manual.
    </p>
    <div appTableScroll role="region" aria-label="H, V and VH ribs">
      <table class="parameter-table">
        <caption>
          H, V and VH ribs
        </caption>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Row number</th>
            <th scope="col">Rib type</th>
            @for (p of parameterColumns(); track p) {
              <th scope="col">Column {{ p + 3 }}</th>
            }
            <th scope="col" class="row-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          @for (rib of form.ribs; track rib; let i = $index) {
            <tr [appRecordRow]="form.ribs" [index]="i">
              <th scope="row">{{ i + 1 }}</th>
              <td><app-number-field compact label="Row number" [field]="rib.number" /></td>
              <td>
                <app-select-field
                  compact
                  label="Rib type"
                  [field]="rib.type"
                  [options]="ribTypes"
                />
              </td>
              @for (p of parameterColumns(); track p) {
                <td>
                  @if (p < 8 || rib.type().value() === 6 || rib.type().value() === 16) {
                    <app-number-field
                      compact
                      [label]="'Column ' + (p + 3)"
                      hint="Meaning depends on the rib type; see the section manual."
                      [field]="rib.parameters[p]"
                    />
                  } @else {
                    <span aria-label="Not used for this rib type">—</span>
                  }
                </td>
              }
              <td class="row-actions">
                <app-remove-row [rows]="form.ribs" [index]="i" label="hvr row" />
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
    <app-add-row
      label="hvr row"
      [rows]="form.ribs"
      [max]="200"
      [row]="{ number: form.ribs.length + 1, type: 1, parameters: [1, 1, 1, 1, 0, 0, 0, 0, 0, 0] }"
    />
  `,
  styleUrl: './section.css',
})
export class HvRibsSection {
  protected readonly editor = inject(EditorState);
  protected readonly form = this.editor.form.hvRibs;
  protected readonly parameterColumns = computed(() =>
    Array.from(
      {
        length: this.form
          .ribs()
          .value()
          .some((rib) => rib.type === 6 || rib.type === 16)
          ? 10
          : 8,
      },
      (_, p) => p,
    ),
  );
  protected readonly ribTypes = [
    [1, 'Horizontal strap'],
    [2, 'Partial V-rib'],
    [3, 'Full V-rib'],
    [4, 'VH-rib across 3 cells'],
    [5, 'Continuous VH-rib'],
    [6, 'General diagonal'],
    [11, 'Type 1 in % chord'],
    [12, 'Type 2 in % chord'],
    [13, 'Type 3 in % chord'],
    [14, 'Type 4 in % chord'],
    [15, 'Type 5 in % chord'],
    [16, 'Type 6 in % chord'],
  ] as const;
}
