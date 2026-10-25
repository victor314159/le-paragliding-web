import { Component, computed, inject, linkedSignal, untracked } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatButtonToggle, MatButtonToggleGroup } from '@angular/material/button-toggle';
import { EditorState, type PreprocessorStatus } from './editor-state';
import { NumberField } from './number-field';
import { toExplicitWidths } from './preprocessor-draft';
import { AddRow, RecordRow, RemoveRow } from './record-editor';
import { SelectField } from './select-field';
import { ShapeFields } from './shape-fields';
import { TextField } from './text-field';

const STATUS: Readonly<Record<PreprocessorStatus, string>> = {
  invalid: 'Invalid parameters',
  synced: 'Geometry in sync with section 1',
  differs: 'Geometry differs from section 1',
};

/** The parameters of pre-data.txt, and whether they generate the rib table of section 1. */
@Component({
  selector: 'app-preprocessor-section',
  imports: [
    AddRow,
    MatButton,
    MatButtonToggle,
    MatButtonToggleGroup,
    NumberField,
    RecordRow,
    RemoveRow,
    SelectField,
    ShapeFields,
    TextField,
  ],
  template: `
    @if (!editor.preprocessor.loaded()) {
      <p>
        This project has no pre-data.txt. Its parameters generate the cells and rib positions of
        section 1 from a few curves. It starts in Auto, with the area, aspect ratio, taper, sweep,
        vault angle and cells of section 1.
      </p>
      <button matButton="outlined" type="button" (click)="editor.createPreprocessor()">
        Create from section 1
      </button>
    } @else {
      <div class="geometry-status">
        <p role="status" [class.mat-text-error]="status() === 'invalid'">
          {{ statusText() }}
        </p>
        <!-- Always shown: the controls below keep their place while settings change. -->
        <button
          matButton="filled"
          type="button"
          [disabled]="status() !== 'differs'"
          (click)="editor.applyPreprocessor()"
        >
          Replace the rib table of section 1
        </button>
      </div>
      <!-- Always one line, the cell count changed or not: the controls below stay in place. -->
      <p class="mat-text-on-surface-variant">
        @if (newCellCount(); as cells) {
          Replacing the rib table changes the cell count from
          {{ editor.draft.value().geometry.cells }} to {{ cells }}; other sections may need
          corrections.
        } @else {
          Replacing the rib table keeps the cell count of section 1.
        }
      </p>
      <p class="mat-text-on-surface-variant">
        Lengths are before Wing scale. Applying keeps the other rib columns.
        @if (!editor.preprocessor.exists) {
          Saving creates pre-data.txt.
          <button matButton type="button" (click)="editor.preprocessor.discard()">
            Discard pre-data.txt
          </button>
        }
      </p>
      <mat-button-toggle-group
        aria-label="Shape mode"
        hideSingleSelectionIndicator
        [value]="mode()"
        (change)="mode.set($event.value)"
      >
        <mat-button-toggle value="auto">Auto</mat-button-toggle>
        <mat-button-toggle value="manual">Manual</mat-button-toggle>
      </mat-button-toggle-group>
      @if (mode() === 'auto') {
        <app-shape-fields />
      } @else {
        <fieldset>
          <legend>Wing</legend>
          <app-text-field
            label="Name"
            hint="Read and not used by the preprocessor."
            [field]="form.name"
            (focusin)="editor.focusPreprocessor(undefined)"
          />
          <app-number-field
            label="Flat half span · xm"
            unit="cm"
            hint="Shared by both edges."
            [field]="form.halfSpan"
            (focusin)="editor.focusPreprocessor({ part: 'span' })"
          />
        </fieldset>
        <fieldset>
          <legend>Leading edge</legend>
          <p>
            Corrections grow from their start to the tip. Set the tip correction to zero to disable
            it.
          </p>
          @for (group of leadingEdge; track group.label) {
            <fieldset (focusin)="editor.focusPreprocessor(group.focus)">
              <legend>{{ group.label }}</legend>
              @for (field of group.fields; track field[0]) {
                <app-number-field
                  [label]="field[1]"
                  [unit]="field[2]"
                  [field]="form.leadingEdge[field[0]]"
                />
              }
            </fieldset>
          }
        </fieldset>
        <fieldset>
          <legend>Trailing edge</legend>
          <p>
            The ellipse offset sets the central chord. Set the tip correction to zero to disable it.
          </p>
          @for (group of trailingEdge; track group.label) {
            <fieldset (focusin)="editor.focusPreprocessor(group.focus)">
              <legend>{{ group.label }}</legend>
              @for (field of group.fields; track field[0]) {
                <app-number-field
                  [label]="field[1]"
                  [unit]="field[2]"
                  [field]="form.trailingEdge[field[0]]"
                />
              }
            </fieldset>
          }
        </fieldset>
        <fieldset>
          <legend>Vault</legend>
          <p>Scaled so that its developed length is the flat half span.</p>
          <app-select-field
            label="Vault shape"
            [field]="form.vault.mode"
            (focusin)="editor.focusPreprocessor({ part: 'vault' })"
            [options]="[
              [1, 'Corrected ellipse'],
              [2, 'Four tangent arcs'],
            ]"
          />
          @if (form.vault.mode().value() === 1) {
            @for (group of ellipse; track group.label) {
              <fieldset (focusin)="editor.focusPreprocessor(group.focus)">
                <legend>{{ group.label }}</legend>
                @for (field of group.fields; track field[0]) {
                  <app-number-field
                    [label]="field[1]"
                    [unit]="field[2]"
                    [field]="form.vault[field[0]]"
                  />
                }
              </fieldset>
            }
          } @else {
            @for (arc of form.vault.arcs; track $index; let i = $index) {
              <fieldset (focusin)="editor.focusPreprocessor({ part: 'vault', arc: i })">
                <legend>
                  Arc {{ i + 1 }} · {{ i === 0 ? 'Center' : i === 3 ? 'Tip' : 'Intermediate' }}
                </legend>
                <app-number-field
                  [label]="'Arc ' + (i + 1) + ' radius'"
                  unit="cm"
                  [field]="arc.radius"
                />
                <app-number-field
                  [label]="'Arc ' + (i + 1) + ' angle'"
                  unit="deg"
                  [field]="arc.angle"
                />
              </fieldset>
            }
          }
        </fieldset>
        <fieldset>
          <legend>Cells</legend>
          <app-select-field
            label="Cell distribution"
            [field]="form.distribution.mode"
            (focusin)="editor.focusPreprocessor({ part: 'cells' })"
            (changed)="changeDistribution($event)"
            [options]="[
              [1, 'Uniform'],
              [2, 'Linear'],
              [3, 'Proportional to chord'],
              [4, 'Explicit widths'],
            ]"
          />
          @switch (form.distribution.mode().value()) {
            @case (4) {
              <app-select-field
                label="Wing center"
                [field]="form.distribution.center"
                (focusin)="editor.focusPreprocessor({ part: 'cells' })"
                [options]="[
                  ['rib', 'Central rib · even cell count'],
                  ['cell', 'Central cell · odd cell count'],
                ]"
              />
              <p>
                Widths of the half wing, from center to tip, normalized to the span. A central cell
                has its full width in the first row.
              </p>
              @for (width of form.distribution.widths; track width; let i = $index) {
                <div
                  class="width"
                  [appRecordRow]="form.distribution.widths"
                  [index]="i"
                  (focusin)="editor.focusPreprocessor({ part: 'cells', cell: i })"
                >
                  <app-number-field
                    [label]="
                      form.distribution.center().value() === 'cell' && i === 0
                        ? 'Central cell width'
                        : 'Cell ' + (i + 1) + ' width'
                    "
                    unit="cm"
                    [field]="width"
                  />
                  <app-remove-row
                    [rows]="form.distribution.widths"
                    [index]="i"
                    label="cell width"
                  />
                </div>
              }
              <app-add-row
                label="cell width"
                [rows]="form.distribution.widths"
                [row]="20"
                [max]="99"
              />
            }
            @default {
              <app-number-field
                label="Cells"
                integer
                [field]="form.distribution.cells"
                (focusin)="editor.focusPreprocessor({ part: 'cells' })"
              />
              @if (form.distribution.mode().value() !== 1) {
                <app-number-field
                  label="Distribution coefficient"
                  (focusin)="editor.focusPreprocessor({ part: 'cells' })"
                  hint="0: strongest taper, or fully proportional to chord. 1: uniform widths."
                  [field]="form.distribution.coefficient"
                />
              }
            }
          }
        </fieldset>
      }
    }
  `,
  styleUrl: './section.css',
  styles: `
    .geometry-status {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 16px;
      margin-block: 16px 8px;
    }
    .geometry-status p {
      margin: 0;
      font: var(--mat-sys-title-small);
    }
    mat-button-toggle-group {
      margin-block: 8px;
    }
    .width {
      display: flex;
      align-items: start;
      gap: 4px;
      min-width: 0;
      /* The selection background goes around the field, which stays aligned. */
      margin: -4px;
      padding: 4px;
      border-radius: 8px;
    }
    .width.selected {
      background: var(--mat-sys-secondary-container);
    }
    .width app-number-field {
      flex: 1;
      min-width: 0;
    }
  `,
})
export class PreprocessorSection {
  protected readonly editor = inject(EditorState);
  protected readonly form = this.editor.preprocessorForm;

  protected readonly status = this.editor.preprocessorStatus;
  protected readonly statusText = computed(() => STATUS[this.status()]);
  /** The cell count that replacing the rib table sets, if it changes. */
  protected readonly newCellCount = computed(() => {
    const cells = this.editor.generated()?.cells;
    return cells !== this.editor.draft.value().geometry.cells ? cells : undefined;
  });

  /**
   * Auto tunes a few settings, Manual edits the parameters: first if Auto
   * would replace some, once they are loaded.
   */
  protected readonly mode = linkedSignal<boolean, 'auto' | 'manual'>({
    source: this.editor.preprocessor.loaded,
    computation: () => {
      const { shape, shapeLosses } = this.editor.preprocessor;
      return untracked(() => !!shape() && !shapeLosses().length) ? 'auto' : 'manual';
    },
  });

  protected readonly leadingEdge = [
    {
      label: 'Ellipse',
      focus: { part: 'leadingEdge' },
      fields: [
        ['a', 'Ellipse horizontal radius · a1', 'cm'],
        ['b', 'Ellipse vertical radius · b1', 'cm'],
      ],
    },
    {
      label: 'Correction 1',
      focus: { part: 'leadingEdge', correction: 1 },
      fields: [
        ['x1', 'First correction start · x1', 'cm'],
        ['correction1', 'First tip correction · c01', 'cm'],
        ['exponent1', 'First correction exponent · ex1', ''],
      ],
    },
    {
      label: 'Correction 2',
      focus: { part: 'leadingEdge', correction: 2 },
      fields: [
        ['x2', 'Second correction start · x2', 'cm'],
        ['correction2', 'Second tip correction · c02', 'cm'],
        ['exponent2', 'Second correction exponent · ex2', ''],
      ],
    },
  ] as const;
  protected readonly trailingEdge = [
    {
      label: 'Ellipse',
      focus: { part: 'trailingEdge' },
      fields: [
        ['a', 'Ellipse horizontal radius · a1', 'cm'],
        ['b', 'Ellipse vertical radius · b1', 'cm'],
        ['offset', 'Ellipse offset · y0', 'cm'],
      ],
    },
    {
      label: 'Tip correction',
      focus: { part: 'trailingEdge', correction: 1 },
      fields: [
        ['x1', 'Correction start · x1', 'cm'],
        ['correction', 'Tip correction · c0', 'cm'],
        ['exponent', 'Correction exponent · ex1', ''],
      ],
    },
  ] as const;
  protected readonly ellipse = [
    {
      label: 'Ellipse',
      focus: { part: 'vault' },
      fields: [
        ['a', 'Vault horizontal radius · a1', 'cm'],
        ['b', 'Vault vertical radius · b1', 'cm'],
      ],
    },
    {
      label: 'Tip correction',
      focus: { part: 'vault' },
      fields: [
        ['x1', 'Vault correction start · x1', 'cm'],
        ['correction', 'Vault tip correction · c1', 'cm'],
      ],
    },
  ] as const;

  protected changeDistribution(mode: number | null): void {
    if (mode === 4) this.editor.preprocessor.value.update(toExplicitWidths);
  }
}
