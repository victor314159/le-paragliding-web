import { Component, computed, input } from '@angular/core';
import type { FieldTree } from '@angular/forms/signals';
import type { EditorForm } from './editor-draft';
import { NumberField } from './number-field';
import { SelectField } from './select-field';
import { TextField } from './text-field';

/** Section 37 values change type with their code; diagnostics still target `value`. */
@Component({
  selector: 'app-special-entry',
  imports: [NumberField, SelectField, TextField],
  template: `
    <div class="field-grid">
      <app-select-field
        label="Parameter code"
        [field]="form().code"
        [options]="codes"
        (changed)="changeCode($event)"
      />
      @if (form().code().value() === 3001) {
        <app-select-field
          label="Minirib transition"
          [field]="form().transition"
          [options]="[
            [1, 'Type 1'],
            [2, 'Type 2'],
            [3, 'Type 3'],
          ]"
        />
        <app-number-field
          label="Transition length"
          unit="% chord"
          hint="First minirib transition parameter."
          [field]="form().values[0]"
        />
        <app-number-field
          label="Transition parameter 2"
          hint="Second minirib transition parameter."
          [field]="form().values[1]"
        />
      } @else if (form().code().value() === 2000) {
        <app-text-field
          label="Edition date"
          hint="Free text, up to 30 UTF-8 bytes."
          [field]="textValue()"
        />
      } @else {
        <app-number-field
          label="Parameter value"
          [hint]="description()"
          [integer]="![1146, 2003].includes(form().code().value() ?? 0)"
          [field]="numberValue()"
        />
      }
    </div>
  `,
  styleUrl: './section.css',
})
export class SpecialEntryFields {
  readonly form = input.required<EditorForm['specialParameters']['entries'][number]>();
  // Only the selected control binds this union-valued field.
  protected readonly numberValue = computed(() => this.form().value as FieldTree<number | null>);
  protected readonly textValue = computed(() => this.form().value as FieldTree<string>);
  protected readonly codes = [
    [1146, 'Section center of gravity (%)'],
    [1291, 'STL segments'],
    [1341, 'Colors by line type'],
    [1351, 'Equilibrium method'],
    [1352, 'Flat or projected area'],
    [1353, 'Equilibrium output detail'],
    [2000, 'Edition date'],
    [2003, 'Forced assiette (deg)'],
    [2005, 'Reference lines 2005'],
    [2006, 'Reference lines 2006'],
    [3001, 'Minirib transitions'],
    [3002, 'Ellipse segments'],
  ] as const;
  protected readonly description = computed(() => {
    switch (this.form().code().value()) {
      case 1146:
        return 'Center of gravity of a section (% chord).';
      case 1291:
        return 'Number of segments for STL output.';
      case 1341:
        return '0: colors by line plan; 1: colors from section 34.';
      case 1351:
        return 'Equilibrium solution method.';
      case 1352:
        return '1: flat area; 2: projected area.';
      case 1353:
        return 'Output detail level, from 0 to 2.';
      case 2003:
        return 'Forced assiette angle in degrees.';
      case 2005:
      case 2006:
        return '0: disabled; 1: reference lines enabled.';
      case 3002:
        return 'Number of segments for ellipses.';
      default:
        return 'Value of the selected special parameter.';
    }
  });
  protected changeCode(code: number | null): void {
    this.form()().value.update((entry) => {
      const { value } = entry;
      const numberValue = typeof value === 'string' ? entry.numberValue : value;
      const textValue = typeof value === 'string' ? value : entry.textValue;
      return { ...entry, numberValue, textValue, value: code === 2000 ? textValue : numberValue };
    });
  }
}
