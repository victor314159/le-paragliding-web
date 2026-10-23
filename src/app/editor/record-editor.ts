import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  computed,
  contentChild,
  Directive,
  inject,
  input,
  TemplateRef,
} from '@angular/core';
import type { FieldTree } from '@angular/forms/signals';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatOption, MatSelect } from '@angular/material/select';
import { MatTooltip } from '@angular/material/tooltip';
import { EditorState } from './editor-state';

const count = (n: number, noun: string) => `${n} ${n === 1 ? noun : noun + 's'}`;

/** The summary of a group of ribs, for a record selector. */
export const ribRange = (row: { firstRib: number | null; lastRib: number | null }) =>
  `Ribs ${row.firstRib}–${row.lastRib}`;

/** A table row of a collection: focusing it selects it, for the preview. */
@Directive({
  selector: 'tr[appRecordRow]',
  host: {
    '[class.selected]': 'editor.selectedRecord(appRecordRow()) === index()',
    '(focusin)': 'editor.selectRecord(appRecordRow(), index())',
  },
})
export class RecordRow {
  readonly appRecordRow = input.required<FieldTree<readonly unknown[]>>();
  readonly index = input.required<number>();
  protected readonly editor = inject(EditorState);
}

/** Adds a copy of `row` to a collection, up to `max` rows. */
@Component({
  selector: 'app-add-row',
  imports: [MatButton],
  template: `
    <button
      matButton="outlined"
      type="button"
      [disabled]="rows().length >= max()"
      (click)="editor.append(rows(), row())"
    >
      Add {{ label() }}
    </button>
  `,
  styles: `
    :host {
      display: block;
      grid-column: 1 / -1;
    }
  `,
})
export class AddRow<T> {
  readonly rows = input.required<FieldTree<readonly T[]>>();
  readonly row = input.required<T>();
  readonly label = input.required<string>();
  readonly max = input(Infinity);
  protected readonly editor = inject(EditorState);
}

/** Removes a row of a collection. */
@Component({
  selector: 'app-remove-row',
  imports: [MatIconButton, MatIcon, MatTooltip],
  template: `
    <button
      matIconButton
      type="button"
      [attr.aria-label]="'Remove ' + label()"
      [matTooltip]="'Remove ' + label()"
      (click)="editor.remove(rows(), index())"
    >
      <mat-icon svgIcon="delete" />
    </button>
  `,
  styles: `
    button {
      --mat-icon-button-state-layer-size: 36px;
      --mat-icon-button-touch-target-size: 36px;
      vertical-align: middle;
    }
  `,
})
export class RemoveRow {
  readonly rows = input.required<FieldTree<readonly unknown[]>>();
  readonly index = input.required<number>();
  readonly label = input.required<string>();
  protected readonly editor = inject(EditorState);
}

interface RecordContext<T> {
  $implicit: FieldTree<T, number>;
  index: number;
}

/** The fields of the selected record, typed by its collection. */
@Directive({ selector: 'ng-template[appRecordFields]' })
export class RecordFields<T extends object> {
  readonly appRecordFields = input.required<FieldTree<readonly T[]>>();
  readonly template = inject<TemplateRef<RecordContext<T>>>(TemplateRef);
  /** Types `let-` variables; the template type checker reads only its signature. */
  static ngTemplateContextGuard<T extends object>(
    directive: RecordFields<T>,
    context: unknown,
  ): context is RecordContext<T> {
    return !!directive && !!context;
  }
}

/** A record selector above the fields of the selected record, also for nested collections. */
@Component({
  selector: 'app-record-editor',
  imports: [MatOption, MatSelect, NgTemplateOutlet, RemoveRow],
  template: `
    <div class="collection-heading">
      <h4>{{ label() }}</h4>
      @if (form().length) {
        <mat-select
          class="record-selector"
          [aria-label]="'Select ' + label().toLowerCase()"
          [value]="selected()"
          [disabled]="editor.unparsed().length > 0"
          (selectionChange)="editor.selectRecord(form(), $event.value)"
        >
          @for (row of form(); track row; let i = $index) {
            <mat-option [value]="i">
              {{ i + 1 }} · {{ summary()(row().value(), i) }}
              @if (row().errorSummary().length; as errors) {
                · {{ count(errors, 'error') }}
              }
            </mat-option>
          }
        </mat-select>
      }
      <span>{{ count(form().length, 'row') }}</span>
      @if (form()().errorSummary().length; as errors) {
        <span class="mat-text-error">{{ count(errors, 'error') }}</span>
      }
      @if (form().length) {
        <app-remove-row [rows]="form()" [index]="selected()" [label]="label().toLowerCase()" />
      }
    </div>
    @if (form().length) {
      <div class="record-detail">
        <ng-container
          [ngTemplateOutlet]="fields().template"
          [ngTemplateOutletContext]="context()"
        />
      </div>
    } @else {
      <p class="mat-text-on-surface-variant">No {{ label().toLowerCase() }} yet.</p>
    }
  `,
  styleUrls: ['./section.css', './record-editor.css'],
})
export class RecordEditor<T extends object> {
  readonly form = input.required<FieldTree<readonly T[]>>();
  readonly label = input.required<string>();
  readonly summary = input.required<(row: T, index: number) => string>();
  protected readonly editor = inject(EditorState);
  protected readonly count = count;
  protected readonly fields = contentChild.required(RecordFields<T>);
  protected readonly selected = computed(() => this.editor.selectedRecord(this.form()));
  protected readonly context = computed<RecordContext<T>>(() => ({
    $implicit: this.form()[this.selected()] as FieldTree<T, number>,
    index: this.selected(),
  }));
}
