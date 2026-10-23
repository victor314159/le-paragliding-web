import { Component, inject } from '@angular/core';
import { EditorState } from './editor-state';
import { NumberField } from './number-field';

@Component({
  selector: 'app-marks-section',
  imports: [NumberField],
  template: `
    <fieldset>
      <legend>Sewing marks</legend>
      <app-number-field label="Sewing mark spacing" unit="cm" [field]="form.spacing" />
      <app-number-field label="Mark point radius" unit="cm" [field]="form.pointRadius" />
      <app-number-field label="Mark point offset" unit="cm" [field]="form.pointOffset" />
    </fieldset>
  `,
  styleUrl: './section.css',
})
export class MarksSection {
  protected readonly editor = inject(EditorState);
  protected readonly form = this.editor.form.marks;
}
