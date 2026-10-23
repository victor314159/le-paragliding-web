import { Component, inject } from '@angular/core';
import { EditorState } from './editor-state';
import { NumberField } from './number-field';
import { AddRow, RecordRow, RemoveRow } from './record-editor';
import { SelectField } from './select-field';
import { TableScroll } from './table-scroll';

@Component({
  selector: 'app-glue-vents-section',
  imports: [AddRow, NumberField, RecordRow, RemoveRow, SelectField, TableScroll],
  template: `
    <div class="section-controls">
      <app-select-field
        label="Glue vents mode"
        [field]="form.mode"
        [options]="[
          [0, 'Disabled'],
          [1, 'Enabled'],
        ]"
      />
    </div>
    @if (form.mode().value() !== 0) {
      <div appTableScroll role="region" aria-label="Vent ribs">
        <table class="parameter-table">
          <caption>
            Vent ribs
          </caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Vent type</th>
              <th scope="col">Left / X width (%)</th>
              <th scope="col">Right / Y width (%)</th>
              <th scope="col">Arch depth (%)</th>
              <th scope="col" class="row-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (rib of form.ribs; track rib; let i = $index) {
              <tr [appRecordRow]="form.ribs" [index]="i">
                <th scope="row">{{ i + 1 }}</th>
                <td>
                  <app-select-field
                    compact
                    label="Vent type"
                    [field]="rib.type"
                    [options]="[
                      [0, 'Open'],
                      [1, 'Glued to extrados'],
                      [-1, 'Glued to intrados'],
                      [-2, 'Diagonal −2'],
                      [-3, 'Diagonal −3'],
                      [4, 'General diagonal +4'],
                      [-4, 'General diagonal −4'],
                      [5, 'Arched +5'],
                      [-5, 'Arched −5'],
                      [6, 'Elliptical +6'],
                      [-6, 'Elliptical −6'],
                    ]"
                  />
                </td>
                <td>
                  @if ([4, -4, 5, -5, 6, -6].includes(rib.type().value() ?? 0)) {
                    <app-number-field
                      compact
                      label="Left / X width"
                      unit="%"
                      [field]="rib.parameters[0]"
                    />
                  }
                </td>
                <td>
                  @if ([4, -4, 5, -5, 6, -6].includes(rib.type().value() ?? 0)) {
                    <app-number-field
                      compact
                      label="Right / Y width"
                      unit="%"
                      [field]="rib.parameters[1]"
                    />
                  }
                </td>
                <td>
                  @if ([5, -5].includes(rib.type().value() ?? 0)) {
                    <app-number-field
                      compact
                      label="Arch depth"
                      unit="%"
                      [field]="rib.parameters[2]"
                    />
                  }
                </td>
                <td class="row-actions">
                  <app-remove-row [rows]="form.ribs" [index]="i" label="vent rib" />
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <app-add-row
        label="vent rib"
        [rows]="form.ribs"
        [max]="100"
        [row]="{ type: 0, parameters: [0, 0, 0] }"
      />
    }
  `,
  styleUrl: './section.css',
})
export class GlueVentsSection {
  protected readonly editor = inject(EditorState);
  protected readonly form = this.editor.form.glueVents;
}
