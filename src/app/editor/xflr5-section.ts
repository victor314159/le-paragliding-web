import { Component, inject } from '@angular/core';
import { EditorState } from './editor-state';
import { NumberField } from './number-field';
import { SelectField } from './select-field';

@Component({
  selector: 'app-xflr5-section',
  imports: [NumberField, SelectField],
  template: `
    <div class="section-controls">
      <app-select-field
        label="XFLR5 export mode"
        [field]="form.mode"
        [options]="[
          [0, 'Disabled'],
          [1, 'Enabled'],
        ]"
      />
    </div>
    @if (form.mode().value() !== 0) {
      <fieldset>
        <legend>Panel mesh</legend>
        <app-number-field label="Panels along chord" integer [field]="form.panels.chord" />
        <app-number-field label="Panels per cell" integer [field]="form.panels.span" />
        <app-number-field
          label="Chord distribution"
          integer
          [field]="form.panels.chordDistribution"
        />
        <app-number-field
          label="Span distribution"
          integer
          [field]="form.panels.spanDistribution"
        />
      </fieldset>
      <fieldset>
        <legend>Airfoil export</legend>
        <app-number-field
          label="Billowed airfoils"
          hint="Read by 3.29; billowed airfoils are not implemented."
          integer
          [field]="form.billowed"
        />
      </fieldset>
    }
  `,
  styleUrl: './section.css',
})
export class Xflr5Section {
  protected readonly editor = inject(EditorState);
  protected readonly form = this.editor.form.xflr5;
}
