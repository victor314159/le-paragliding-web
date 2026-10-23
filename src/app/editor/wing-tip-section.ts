import { Component, inject } from '@angular/core';
import { EditorState } from './editor-state';
import { NumberField } from './number-field';
import { SelectField } from './select-field';

@Component({
  selector: 'app-wing-tip-section',
  imports: [NumberField, SelectField],
  template: `
    <div class="section-controls">
      <app-select-field
        label="Wing tip mode"
        [field]="form.mode"
        [options]="[
          [0, 'Unchanged'],
          [1, 'Edge angles'],
          [2, 'Rounded parabola in planform'],
          [4, 'Last rib displacement and rotation'],
        ]"
      />
    </div>
    @if (form.mode().value() === 1) {
      <fieldset>
        <legend>Edge angles</legend>
        <app-number-field label="Leading edge angle" unit="deg" [field]="form.angleLE" />
        <app-number-field label="Trailing edge angle" unit="deg" [field]="form.angleTE" />
      </fieldset>
    }
    @if (form.mode().value() === 2) {
      <fieldset>
        <legend>Rounded wing tip</legend>
        <app-number-field
          label="Parabola distance"
          hint="Position along the last rib chord, as consumed by the engine."
          unit="% chord"
          [field]="form.distance"
        />
        <app-number-field label="Parabola angle" unit="deg" [field]="form.angle" />
      </fieldset>
    }
    @if (form.mode().value() === 4) {
      <fieldset>
        <legend>Last rib</legend>
        <app-number-field label="Last rib displacement" unit="cm" [field]="form.displacement" />
        <app-number-field label="Last rib rotation" unit="deg" [field]="form.rotation" />
      </fieldset>
    }
  `,
  styleUrl: './section.css',
})
export class WingTipSection {
  protected readonly editor = inject(EditorState);
  protected readonly form = this.editor.form.wingTip;
}
