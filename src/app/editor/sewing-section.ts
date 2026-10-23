import { Component, input } from '@angular/core';
import type { SewingForm } from './editor-draft';
import { NumberField } from './number-field';

@Component({
  selector: 'app-sewing-section',
  imports: [NumberField],
  template: `
    @for (panel of panels; track panel.key) {
      <fieldset>
        <legend>{{ panel.label }}</legend>
        @for (edge of edges; track edge.key) {
          <app-number-field
            [label]="panel.label + ' · ' + edge.label + ' (mm)'"
            [hint]="'Seam width at the ' + edge.hint + '.'"
            [field]="form()[panel.key][edge.key]"
          />
        }
      </fieldset>
    }
    <fieldset>
      <legend>Ribs</legend>
      <app-number-field
        label="Rib edges (mm)"
        hint="Seam width around the ribs."
        [field]="form().ribs"
      />
      <app-number-field
        label="V-rib edges (mm)"
        hint="Seam width around the V-ribs."
        [field]="form().vRibs"
      />
    </fieldset>
  `,
  styleUrl: './section.css',
})
export class SewingSection {
  readonly form = input.required<SewingForm>();
  protected readonly panels = [
    { key: 'upper', label: 'Upper panels' },
    { key: 'lower', label: 'Lower panels' },
  ] as const;
  protected readonly edges = [
    { key: 'sides', label: 'Sides', hint: 'side edges' },
    { key: 'leadingEdge', label: 'Leading edge', hint: 'leading edge' },
    { key: 'trailingEdge', label: 'Trailing edge', hint: 'trailing edge' },
  ] as const;
}
