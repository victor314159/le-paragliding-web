import { Component, inject } from '@angular/core';
import { EditorState } from './editor-state';
import { NumberField } from './number-field';

@Component({
  selector: 'app-tab-reinforcements-section',
  imports: [NumberField],
  template: `
    <fieldset>
      <legend>Tab reinforcements</legend>
      <app-number-field
        label="Tab reinforcements mode"
        hint="The feature is not functional in 3.29; the documented value is 0."
        integer
        [field]="form.mode"
      />
    </fieldset>
  `,
  styleUrl: './section.css',
})
export class TabReinforcementsSection {
  protected readonly editor = inject(EditorState);
  protected readonly form = this.editor.form.tabReinforcements;
}
