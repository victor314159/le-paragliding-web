import { Component, inject } from '@angular/core';
import { ColorsByLineType } from './colors-by-line-type';
import { EditorState } from './editor-state';
import { LineColors } from './line-colors';
import { NumberField } from './number-field';
import { SelectField } from './select-field';

@Component({
  selector: 'app-dxf3d-section',
  imports: [ColorsByLineType, LineColors, NumberField, SelectField],
  template: `
    <app-colors-by-line-type />
    <div class="section-controls">
      <app-select-field
        label="3D DXF mode"
        hint="Mode 0 uses the engine's colors; mode 1 also controls the unifilar surfaces."
        [field]="form.mode"
        [options]="[
          [0, 'Engine defaults'],
          [1, 'Custom colors and surfaces'],
        ]"
      />
    </div>
    @if (form.mode().value() === 1) {
      <app-line-colors [form]="form.lineColors" />
      @for (name of names; track name; let index = $index) {
        <fieldset>
          <legend>{{ name }}</legend>
          <app-select-field
            [label]="name + ' surface'"
            [field]="form.surfaces[index].drawn"
            [options]="[
              [0, 'Hidden'],
              [1, 'Drawn'],
            ]"
          />
          <app-number-field
            [label]="name + ' color'"
            [hint]="'DXF color index for the unifilar ' + name.toLowerCase() + ' surface.'"
            integer
            [field]="form.surfaces[index].color"
          />
        </fieldset>
      }
    }
  `,
  styleUrl: './section.css',
})
export class Dxf3dSection {
  protected readonly form = inject(EditorState).form.dxf3d;
  protected readonly names = ['Extrados', 'Vents', 'Intrados'];
}
