import { booleanAttribute, Component, computed, inject, input, output } from '@angular/core';
import { FormField, type FieldTree } from '@angular/forms/signals';
import { MatError, MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatOption, MatSelect } from '@angular/material/select';
import { EditorState } from './editor-state';

let nextId = 0;

/** The same outlined, labeled select for each section's modes and types. */
@Component({
  selector: 'app-select-field',
  imports: [FormField, MatError, MatFormField, MatHint, MatLabel, MatOption, MatSelect],
  template: `
    @if (compact()) {
      <mat-select
        class="cell-input select-cell"
        [aria-label]="label()"
        [title]="title()"
        [attr.aria-invalid]="field()().invalid()"
        [attr.aria-describedby]="field()().invalid() ? errorId : null"
        [formField]="binding()"
        (selectionChange)="select($event.value)"
      >
        @for (option of options(); track option[0]) {
          <mat-option [value]="option[0]" [disabled]="editor.unparsed().length > 0"
            >{{ option[0] }} · {{ option[1] }}</mat-option
          >
        }
      </mat-select>
      <span class="cell-errors" [id]="errorId">
        @for (error of field()().errors(); track $index) {
          <span>{{ error.message }}</span>
        }
      </span>
    } @else {
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>{{ label() }}</mat-label>
        <mat-select [formField]="binding()" (selectionChange)="select($event.value)">
          @for (option of options(); track option[0]) {
            <mat-option [value]="option[0]" [disabled]="editor.unparsed().length > 0"
              >{{ option[0] }} · {{ option[1] }}</mat-option
            >
          }
        </mat-select>
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
export class SelectField<T extends string | number | null> {
  readonly compact = input(false, { transform: booleanAttribute });
  protected readonly errorId = 'select-field-errors-' + nextId++;
  readonly label = input.required<string>();
  readonly hint = input('');
  readonly field = input.required<FieldTree<T>>();
  readonly options = input.required<readonly (readonly [NonNullable<T>, string])[]>();
  readonly changed = output<T>();
  // A concrete primitive union lets FormField resolve its control type inside a generic component.
  protected readonly binding = computed(() => this.field() as FieldTree<string | number | null>);
  protected readonly editor = inject(EditorState);
  protected readonly title = computed(() => {
    const value = this.field()().value();
    const label = this.options().find(([key]) => key === value)?.[1];
    return [value, label, this.hint()].filter((part) => part !== null && part !== '').join(' · ');
  });
  protected select(value: unknown): void {
    this.changed.emit(value as T);
  }
}
