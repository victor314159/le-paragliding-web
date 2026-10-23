import { booleanAttribute, Component, computed, input } from '@angular/core';
import { FormField, type FieldTree } from '@angular/forms/signals';
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';

/**
 * A number of the model in a text input: Signal Forms parse it, keep text that
 * is not a number as typed, with a parse error, and set null when it is empty.
 * Only the control holds that text: EditorState keeps its section shown, and a
 * field hidden by a mode keeps its last number.
 */
@Component({
  selector: 'app-number-field',
  imports: [FormField, MatError, MatFormField, MatHint, MatLabel, MatInput],
  template: `
    <mat-form-field appearance="outline" subscriptSizing="dynamic">
      <mat-label>{{ fullLabel() }}</mat-label>
      <input
        matInput
        type="text"
        [attr.inputmode]="integer() ? 'numeric' : 'decimal'"
        [formField]="field()"
      />
      <mat-hint>{{ hint() }}</mat-hint>
      @for (error of field()().errors(); track $index) {
        <mat-error>{{ error.kind === 'parse' ? 'Enter a number.' : error.message }}</mat-error>
      }
    </mat-form-field>
  `,
  styles: `
    :host,
    mat-form-field {
      display: block;
      width: 100%;
    }
  `,
})
export class NumberField {
  readonly label = input.required<string>();
  readonly hint = input.required<string>();
  readonly field = input.required<FieldTree<number | null>>();
  /** Shown after the label, as `(mm)`. */
  readonly unit = input<string>();
  /** An integer: a numeric keyboard, without a decimal separator. */
  readonly integer = input(false, { transform: booleanAttribute });
  protected readonly fullLabel = computed(() =>
    this.unit() ? `${this.label()} (${this.unit()})` : this.label(),
  );
}
