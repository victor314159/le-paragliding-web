import { Component, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { EditorState } from './editor-state';
import { NumberField } from './number-field';
import { toExplicitWidths } from './preprocessor-draft';
import { AddRow, RemoveRow } from './record-editor';
import { SelectField } from './select-field';
import { TextField } from './text-field';

/** The parameters of pre-data.txt, and whether they generate the rib table of section 1. */
@Component({
  selector: 'app-preprocessor-section',
  imports: [AddRow, MatButton, NumberField, RemoveRow, SelectField, TextField],
  template: `
    @if (!editor.preprocessor.loaded()) {
      <p>
        This project has no pre-data.txt. Its parameters generate the cells and rib positions of
        section 1 from a few curves.
      </p>
      <button matButton="outlined" type="button" (click)="editor.preprocessor.create()">
        Create from the documented example
      </button>
    } @else {
      @if (!editor.preprocessor.exists) {
        <p>
          Saving creates pre-data.txt.
          <button matButton type="button" (click)="editor.preprocessor.discard()">
            Discard pre-data.txt
          </button>
        </p>
      }
      @if (editor.synced()) {
        <p>The cells and rib positions of section 1 are those these parameters generate.</p>
      } @else {
        <p>
          The cells and rib positions of section 1 differ from those these parameters generate.
          Applying them keeps its other columns; changing the cell count may require corrections in
          other sections.
        </p>
        <button
          matButton="filled"
          type="button"
          [disabled]="!editor.preprocessor.result().ok"
          (click)="editor.applyPreprocessor()"
        >
          Replace the rib table of section 1
        </button>
      }
      <p>Lengths are before Wing scale.</p>
      <fieldset>
        <legend>Wing</legend>
        <app-text-field
          label="Name"
          hint="Read and not used by the preprocessor."
          [field]="form.name"
        />
        <app-number-field
          label="Flat half span · xm"
          unit="cm"
          hint="Shared by both edges."
          [field]="form.halfSpan"
        />
      </fieldset>
      <fieldset>
        <legend>Leading edge</legend>
        <p>
          An ellipse with two tip corrections. Each correction starts at x1 or x2 and reaches its
          displacement at the tip; zero disables it.
        </p>
        @for (field of leadingEdge; track field[0]) {
          <app-number-field
            [label]="field[1]"
            [unit]="field[2]"
            [field]="form.leadingEdge[field[0]]"
          />
        }
      </fieldset>
      <fieldset>
        <legend>Trailing edge</legend>
        <p>An offset ellipse with one tip correction. The offset sets the central chord.</p>
        @for (field of trailingEdge; track field[0]) {
          <app-number-field
            [label]="field[1]"
            [unit]="field[2]"
            [field]="form.trailingEdge[field[0]]"
          />
        }
      </fieldset>
      <fieldset>
        <legend>Vault</legend>
        <p>Scaled so that its developed length is the flat half span.</p>
        <app-select-field
          label="Vault shape"
          [field]="form.vault.mode"
          [options]="[
            [1, 'Corrected ellipse'],
            [2, 'Four tangent arcs'],
          ]"
        />
        @if (form.vault.mode().value() === 1) {
          @for (field of ellipse; track field[0]) {
            <app-number-field [label]="field[1]" [unit]="field[2]" [field]="form.vault[field[0]]" />
          }
        } @else {
          @for (arc of form.vault.arcs; track $index; let i = $index) {
            <fieldset>
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
              <div class="width">
                <app-number-field
                  [label]="
                    form.distribution.center().value() === 'cell' && i === 0
                      ? 'Central cell width'
                      : 'Cell ' + (i + 1) + ' width'
                  "
                  unit="cm"
                  [field]="width"
                />
                <app-remove-row [rows]="form.distribution.widths" [index]="i" label="cell width" />
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
            <app-number-field label="Cells" integer [field]="form.distribution.cells" />
            @if (form.distribution.mode().value() !== 1) {
              <app-number-field
                label="Distribution coefficient"
                hint="0: strongest taper, or fully proportional to chord. 1: uniform widths."
                [field]="form.distribution.coefficient"
              />
            }
          }
        }
      </fieldset>
    }
  `,
  styleUrl: './section.css',
  styles: `
    .width {
      display: flex;
      align-items: start;
      gap: 4px;
      min-width: 0;
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

  protected readonly leadingEdge = [
    ['a', 'Ellipse horizontal radius · a1', 'cm'],
    ['b', 'Ellipse vertical radius · b1', 'cm'],
    ['x1', 'First correction start · x1', 'cm'],
    ['correction1', 'First tip correction · c01', 'cm'],
    ['exponent1', 'First correction exponent · ex1', ''],
    ['x2', 'Second correction start · x2', 'cm'],
    ['correction2', 'Second tip correction · c02', 'cm'],
    ['exponent2', 'Second correction exponent · ex2', ''],
  ] as const;
  protected readonly trailingEdge = [
    ['a', 'Ellipse horizontal radius · a1', 'cm'],
    ['b', 'Ellipse vertical radius · b1', 'cm'],
    ['offset', 'Ellipse offset · y0', 'cm'],
    ['x1', 'Correction start · x1', 'cm'],
    ['correction', 'Tip correction · c0', 'cm'],
    ['exponent', 'Correction exponent · ex1', ''],
  ] as const;
  protected readonly ellipse = [
    ['a', 'Vault horizontal radius · a1', 'cm'],
    ['b', 'Vault vertical radius · b1', 'cm'],
    ['x1', 'Vault correction start · x1', 'cm'],
    ['correction', 'Vault tip correction · c1', 'cm'],
  ] as const;

  protected changeDistribution(mode: number | null): void {
    if (mode === 4) this.editor.preprocessor.value.update(toExplicitWidths);
  }
}
