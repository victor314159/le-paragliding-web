import { Component, inject } from '@angular/core';
import { EditorState } from './editor-state';
import { NumberField } from './number-field';
import { SkinPoints } from './skin-points';

@Component({
  selector: 'app-skin-tension-section',
  imports: [NumberField, SkinPoints],
  template: `
    <app-skin-points [form]="form.points" />
    <fieldset>
      <legend>Panel correction</legend>
      <app-number-field
        label="Minirib strain"
        hint="The usual strain is 0.0114."
        [field]="form.miniribStrain"
      />
      <app-number-field
        label="Correction points"
        hint="1000 with factor 1 selects the full precision method."
        integer
        [field]="form.panelCorrection.points"
      />
      <app-number-field
        label="Correction factor"
        hint="0 disables the older sewing correction."
        [field]="form.panelCorrection.factor"
      />
    </fieldset>
  `,
  styleUrl: './section.css',
})
export class SkinTensionSection {
  protected readonly editor = inject(EditorState);
  protected readonly form = this.editor.form.skinTension;
}
