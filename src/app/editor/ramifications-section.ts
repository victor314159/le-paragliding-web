import { Component, inject } from '@angular/core';
import { EditorState } from './editor-state';
import { NumberField } from './number-field';

@Component({
  selector: 'app-ramifications-section',
  imports: [NumberField],
  template: `
    <fieldset (focusin)="editor.setPreviewView(11, 'lines3')">
      <legend>Lines · 3 levels</legend>
      <app-number-field label="Recorded level" [field]="form.lines3.level" />
      <app-number-field label="Level 2 distance" unit="cm" [field]="form.lines3.l2" />
    </fieldset>
    <fieldset (focusin)="editor.setPreviewView(11, 'lines4')">
      <legend>Lines · 4 levels</legend>
      <app-number-field label="Recorded level" [field]="form.lines4.level" />
      <app-number-field label="Level 3 distance" unit="cm" [field]="form.lines4.l3" />
      <app-number-field label="Level 2 distance" unit="cm" [field]="form.lines4.l2" />
    </fieldset>
    <fieldset (focusin)="editor.setPreviewView(11, 'brakes3')">
      <legend>Brakes · 3 levels</legend>
      <app-number-field label="Recorded level" [field]="form.brakes3.level" />
      <app-number-field label="Level 2 distance" unit="cm" [field]="form.brakes3.l2" />
    </fieldset>
    <fieldset (focusin)="editor.setPreviewView(11, 'brakes4')">
      <legend>Brakes · 4 levels</legend>
      <app-number-field label="Recorded level" [field]="form.brakes4.level" />
      <app-number-field label="Level 3 distance" unit="cm" [field]="form.brakes4.l3" />
      <app-number-field label="Level 2 distance" unit="cm" [field]="form.brakes4.l2" />
    </fieldset>
  `,
  styleUrl: './section.css',
})
export class RamificationsSection {
  protected readonly editor = inject(EditorState);
  protected readonly form = this.editor.form.ramifications;
}
