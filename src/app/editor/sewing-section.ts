import { Component, inject } from '@angular/core';
import { EditorState } from './editor-state';
import { NumberField } from './number-field';

@Component({
  selector: 'app-sewing-section',
  imports: [NumberField],
  template: `
    @for (panel of panels; track panel.key) {
      <fieldset (focusin)="editor.setPreviewView(6, 'panels')">
        <legend>{{ panel.label }}</legend>
        @for (edge of edges; track edge.key) {
          <app-number-field
            [label]="panel.label + ' · ' + edge.label"
            unit="mm"
            [hint]="'Seam width at the ' + edge.hint + '.'"
            [field]="form[panel.key][edge.key]"
          />
        }
      </fieldset>
    }
    <fieldset>
      <legend>Ribs</legend>
      <app-number-field
        label="Rib edges"
        unit="mm"
        hint="Seam width around the ribs."
        [field]="form.ribs"
        (focusin)="editor.setPreviewView(6, 'rib')"
      />
      <app-number-field
        label="V-rib edges"
        unit="mm"
        hint="Seam width around the V-ribs."
        [field]="form.vRibs"
        (focusin)="editor.setPreviewView(6, 'v-rib')"
      />
    </fieldset>
  `,
  styleUrl: './section.css',
})
export class SewingSection {
  protected readonly editor = inject(EditorState);
  protected readonly form = this.editor.form.sewingAllowances;
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
