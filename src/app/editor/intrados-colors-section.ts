import { Component, inject } from '@angular/core';
import { ColorFields } from './color-fields';
import { EditorState } from './editor-state';

@Component({
  selector: 'app-intrados-colors-section',
  imports: [ColorFields],
  template: ` <app-color-fields [form]="form" /> `,
  styleUrl: './section.css',
})
export class IntradosColorsSection {
  protected readonly editor = inject(EditorState);
  protected readonly form = this.editor.form.intradosColors;
}
