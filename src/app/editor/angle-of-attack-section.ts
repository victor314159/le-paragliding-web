import { Component, inject } from '@angular/core';
import { EditorState } from './editor-state';
import { NumberField } from './number-field';

@Component({
  selector: 'app-angle-of-attack-section',
  imports: [NumberField],
  template: `
    <fieldset>
      <legend>Flight geometry</legend>
      <app-number-field label="Glide ratio goal" [field]="form.glideRatio" />
      <app-number-field label="Center of pressure" unit="% chord" [field]="form.centerOfPressure" />
      <app-number-field label="Calage" unit="% chord" [field]="form.calage" />
      <app-number-field label="Basic riser length" unit="cm" [field]="form.risersLength" />
      <app-number-field label="Basic line length" unit="cm" [field]="form.linesLength" />
      <app-number-field label="Karabiner separation" unit="cm" [field]="form.karabinerSeparation" />
    </fieldset>
  `,
  styleUrl: './section.css',
})
export class AngleOfAttackSection {
  protected readonly editor = inject(EditorState);
  protected readonly form = this.editor.form.angleOfAttack;
}
