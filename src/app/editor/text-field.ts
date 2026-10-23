import { booleanAttribute, Component, computed, input } from '@angular/core';
import { FormField, type FieldTree } from '@angular/forms/signals';
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';

let nextId = 0;

/** A string of the model in a text input; compact in a table cell. */
@Component({
  selector: 'app-text-field',
  imports: [FormField, MatError, MatFormField, MatHint, MatLabel, MatInput],
  template: `
    @if (compact()) {
      <input
        matInput
        class="cell-input text-cell"
        type="text"
        [attr.aria-label]="label()"
        [title]="title()"
        [attr.aria-invalid]="field()().invalid()"
        [attr.aria-describedby]="field()().invalid() ? errorId : null"
        [formField]="field()"
      />
      <span class="cell-errors" [id]="errorId">
        @for (error of field()().errors(); track $index) {
          <span>{{ error.message }}</span>
        }
      </span>
    } @else {
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>{{ label() }}</mat-label>
        <input matInput type="text" [formField]="field()" />
        @if (hint()) {
          <mat-hint>{{ hint() }}</mat-hint>
        }
        @for (error of field()().errors(); track $index) {
          <mat-error>{{ error.message }}</mat-error>
        }
      </mat-form-field>
    }
  `,
  styleUrl: './cell-field.css',
})
export class TextField {
  readonly compact = input(false, { transform: booleanAttribute });
  protected readonly errorId = 'text-field-errors-' + nextId++;
  readonly label = input.required<string>();
  readonly hint = input('');
  readonly field = input.required<FieldTree<string>>();
  protected readonly title = computed(() =>
    [this.field()().value(), this.hint()].filter(Boolean).join(' · '),
  );
}
