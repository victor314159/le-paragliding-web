import { Component, inject } from '@angular/core';
import { ColorFields } from './color-fields';
import { EditorState } from './editor-state';

@Component({
  selector: 'app-extrados-colors-section',
  imports: [ColorFields],
  template: ` <app-color-fields [form]="form" /> `,
  styleUrl: './section.css',
})
export class ExtradosColorsSection {
  protected readonly editor = inject(EditorState);
  protected readonly form = this.editor.form.extradosColors;
}
