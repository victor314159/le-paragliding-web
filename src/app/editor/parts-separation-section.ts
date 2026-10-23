import { Component, inject } from '@angular/core';
import { EditorState } from './editor-state';
import { NumberField } from './number-field';
import { SelectField } from './select-field';

@Component({
  selector: 'app-parts-separation-section',
  imports: [NumberField, SelectField],
  template: `
    <div class="section-controls">
      <app-select-field
        label="Parts separation mode"
        [field]="form.mode"
        [options]="[
          [0, 'Engine defaults'],
          [1, 'Custom factors'],
        ]"
      />
    </div>
    @if (form.mode().value() !== 0) {
      <fieldset>
        <legend>Panels</legend>
        <app-number-field
          label="Panels · X"
          hint="Multiplication factor of the default drawing separation."
          [field]="form.panelX"
        />
        <app-number-field
          label="Panels · minimum X"
          hint="Multiplication factor of the default drawing separation."
          [field]="form.panelXMin"
        />
        <app-number-field
          label="Panels · Y"
          hint="Multiplication factor of the default drawing separation."
          [field]="form.panelY"
        />
      </fieldset>
      <fieldset>
        <legend>Ribs</legend>
        <app-number-field
          label="Ribs · X"
          hint="Multiplication factor of the default drawing separation."
          [field]="form.ribX"
        />
        <app-number-field
          label="Ribs · Y"
          hint="Multiplication factor of the default drawing separation."
          [field]="form.ribY"
        />
        <app-number-field
          label="First rib · Y"
          hint="Multiplication factor of the default drawing separation."
          [field]="form.rib1Y"
        />
      </fieldset>
      <fieldset>
        <legend>Rods</legend>
        <app-number-field
          label="Rods · X"
          hint="Multiplication factor of the default drawing separation."
          [field]="form.joncX"
        />
        <app-number-field
          label="Rods · Y"
          hint="Multiplication factor of the default drawing separation."
          [field]="form.joncY"
        />
        <app-number-field
          label="Rods · I"
          hint="Multiplication factor of the default drawing separation."
          [field]="form.joncI"
        />
      </fieldset>
      <fieldset>
        <legend>Additional parameter</legend>
        <app-number-field
          label="Parameter 10"
          hint="Read but unused by 3.29."
          [field]="form.parameter10"
        />
      </fieldset>
    }
  `,
  styleUrl: './section.css',
})
export class PartsSeparationSection {
  protected readonly editor = inject(EditorState);
  protected readonly form = this.editor.form.partsSeparation;
}
