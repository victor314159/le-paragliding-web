import { Component, input } from '@angular/core';
import type { EditorForm } from './editor-draft';
import { NumberField } from './number-field';

/** The same six line color controls in sections 24 and 25. */
@Component({
  selector: 'app-line-colors',
  imports: [NumberField],
  template: `
    <fieldset>
      <legend>Line colors</legend>
      @for (line of lines; track line; let index = $index) {
        <app-number-field
          [label]="line + ' lines color'"
          [hint]="
            line === 'F'
              ? 'DXF color index for the brake lines.'
              : 'DXF color index for the ' + line + ' lines.'
          "
          integer
          [field]="form()[index]"
        />
      }
    </fieldset>
    <p class="mat-text-on-surface-variant">
      Color indices: 1 red, 2 yellow, 3 green, 4 cyan, 5 blue, 6 magenta, 7 white, 8 dark grey, 9
      grey. The CAD palette defines the other colors.
    </p>
  `,
  styleUrl: './section.css',
})
export class LineColors {
  readonly form = input.required<EditorForm['dxf2d']['lineColors']>();
  protected readonly lines = ['A', 'B', 'C', 'D', 'E', 'F'];
}
