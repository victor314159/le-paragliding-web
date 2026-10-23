import { Component, inject } from '@angular/core';
import { EditorState } from './editor-state';
import { NumberField } from './number-field';
import { SelectField } from './select-field';

@Component({
  selector: 'app-calage-variation-section',
  imports: [NumberField, SelectField],
  template: `
    <div class="section-controls">
      <app-select-field
        label="Calage study mode"
        [field]="form.mode"
        [options]="[
          [0, 'Disabled'],
          [1, 'Enabled'],
        ]"
      />
    </div>
    @if (form.mode().value() !== 0) {
      <fieldset>
        <legend>Riser positions</legend>
        <app-number-field
          label="Number of risers"
          hint="The engine handles 2, 3 or 4 risers."
          integer
          [field]="form.risers"
        />
        @for (position of form.positions; track $index) {
          <app-number-field
            [label]="'Riser ' + ($index + 1) + ' position'"
            unit="% chord"
            [field]="position"
          />
        }
      </fieldset>
      <fieldset>
        <legend>Speed system</legend>
        <app-number-field label="Maximum speed-system angle" unit="deg" [field]="form.speedAngle" />
        <app-number-field label="Speed-system steps" integer [field]="form.speedSteps" />
      </fieldset>
      <fieldset>
        <legend>Trimmers</legend>
        <app-number-field label="Maximum trimmer angle" unit="deg" [field]="form.trimAngle" />
        <app-number-field label="Trimmer steps" integer [field]="form.trimSteps" />
      </fieldset>
    }
  `,
  styleUrl: './section.css',
})
export class CalageVariationSection {
  protected readonly editor = inject(EditorState);
  protected readonly form = this.editor.form.calageVariation;
}
