import { Component, inject } from '@angular/core';
import { ColorsByLineType } from './colors-by-line-type';
import { EditorState } from './editor-state';
import { LineColors } from './line-colors';
import { SelectField } from './select-field';

@Component({
  selector: 'app-dxf2d-section',
  imports: [ColorsByLineType, LineColors, SelectField],
  template: `
    <app-colors-by-line-type />
    <div class="section-controls">
      <app-select-field
        label="2D DXF mode"
        hint="Mode 0 uses the engine's colors; mode 1 sets the A–F line colors."
        [field]="form.mode"
        [options]="[
          [0, 'Engine defaults'],
          [1, 'Custom colors'],
        ]"
      />
    </div>
    @if (form.mode().value() === 1) {
      <app-line-colors [form]="form.lineColors" />
    }
  `,
  styleUrl: './section.css',
})
export class Dxf2dSection {
  protected readonly form = inject(EditorState).form.dxf2d;
}
