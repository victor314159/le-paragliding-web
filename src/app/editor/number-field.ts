import { Component, input } from '@angular/core';
import { FormField, type FieldTree } from '@angular/forms/signals';
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';

/** A numeric input keeps text verbatim, including empty or unfinished numbers. */
@Component({
  selector: 'app-number-field',
  imports: [FormField, MatError, MatFormField, MatHint, MatLabel, MatInput],
  template: `
    <mat-form-field appearance="outline" subscriptSizing="dynamic">
      <mat-label>{{ label() }}</mat-label>
      <input matInput type="text" inputmode="decimal" [formField]="field()" />
      <mat-hint>{{ hint() }}</mat-hint>
      @for (error of field()().errors(); track $index) {
        <mat-error>{{ error.message }}</mat-error>
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
  readonly field = input.required<FieldTree<string>>();
}
