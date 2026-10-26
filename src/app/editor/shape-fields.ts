import { Component, computed, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatSlider, MatSliderThumb } from '@angular/material/slider';
import { SHAPE_LIMITS, type ShapePart, type WingShape } from '@lepara/design';
import type { PreprocessorInput } from '@lepara/preprocessor';
import { of, type Observable } from 'rxjs';
import { confirm } from '../shared/confirm-dialog';
import { EditorState } from './editor-state';

const percent = (value: number) => `${Math.round(value * 100)}%`;

/** What Auto replaces in each part. */
const LOSSES: Readonly<Record<ShapePart, (input: PreprocessorInput) => string>> = {
  halfSpan: () => 'the half span, out of range',
  leadingEdge: ({ leadingEdge: le }) =>
    le.correction1 || le.correction2 ? 'the leading edge corrections' : 'the leading edge',
  trailingEdge: ({ trailingEdge: te }) =>
    te.correction ? 'the trailing edge correction' : 'the trailing edge',
  vault: ({ vault }) => (vault.mode === 1 ? 'the ellipse vault' : 'the vault arcs'),
  distribution: ({ distribution: d }) =>
    d.mode === 4
      ? 'the explicit cell widths'
      : d.mode === 3
        ? 'the cell count, out of range'
        : 'the cell distribution',
};

/** What Auto replaces in `input`, as a sentence fragment. */
export const lossText = (losses: readonly ShapePart[], input: PreprocessorInput) =>
  new Intl.ListFormat('en').format(losses.map((part) => LOSSES[part](input)));

/** Emits once: true if an Auto shape loses nothing of `input`, or if `action` is confirmed. */
function confirmShape(
  dialogs: MatDialog,
  losses: readonly ShapePart[],
  input: PreprocessorInput,
  action: string,
): Observable<boolean> {
  return losses.length
    ? confirm(dialogs, {
        title: 'Replace the parameters?',
        message: `Auto sets fewer parameters than this wing has: it replaces ${lossText(losses, input)}.`,
        cancel: 'Keep the parameters',
        confirm: action,
      })
    : of(true);
}

/** The few settings of Auto, which set every parameter of pre-data.txt. */
@Component({
  selector: 'app-shape-fields',
  imports: [MatButton, MatSlider, MatSliderThumb],
  template: `
    @if (shape(); as shape) {
      @if (losses().length) {
        <p>Auto sets fewer parameters than this wing has: it replaces {{ lossText() }}.</p>
        <button matButton="outlined" type="button" (click)="replace(shape)">
          Replace with the Auto shape
        </button>
      } @else {
        <p class="mat-text-on-surface-variant">
          Fine-tune the parameters in Manual: corrections made there are listed here before Auto
          replaces them.
        </p>
      }
      @for (group of groups; track group.label) {
        <fieldset (focusin)="editor.focusPreprocessor(group.focus)">
          <legend>{{ group.label }}</legend>
          @for (setting of group.settings; track setting.key) {
            <div class="setting">
              <span class="setting-label" [id]="'shape-' + setting.key">
                {{ setting.label }}
              </span>
              <output>{{ setting.format(shape[setting.key]) }}</output>
              <mat-slider
                [min]="limits[setting.key][0]"
                [max]="limits[setting.key][1]"
                [step]="setting.step"
                [displayWith]="setting.format"
                [disabled]="losses().length > 0"
              >
                <input
                  matSliderThumb
                  [attr.aria-labelledby]="'shape-' + setting.key"
                  [value]="shape[setting.key]"
                  (input)="setShape(setting.key, $event)"
                />
              </mat-slider>
              <span class="setting-hint">{{ setting.hint }}</span>
            </div>
          }
        </fieldset>
      }
    } @else {
      <p class="mat-text-error">
        The parameters do not generate a wing: correct them in Manual to tune the shape.
      </p>
    }
  `,
  styleUrl: './section.css',
  styles: `
    .setting {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: baseline;
      column-gap: 8px;
    }
    .setting-label {
      font: var(--mat-sys-body-medium);
    }
    .setting output {
      font: var(--mat-sys-label-large);
      font-variant-numeric: tabular-nums;
    }
    .setting mat-slider {
      grid-column: 1 / -1;
      margin-inline: 0;
    }
    .setting-hint {
      grid-column: 1 / -1;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
  `,
})
export class ShapeFields {
  protected readonly editor = inject(EditorState);
  private readonly dialogs = inject(MatDialog);

  protected readonly limits = SHAPE_LIMITS;
  protected readonly shape = this.editor.preprocessor.shape;
  /** What the shape replaces: until then, its settings are disabled. */
  protected readonly losses = this.editor.preprocessor.shapeLosses;
  protected readonly lossText = computed(() =>
    lossText(this.losses(), this.editor.preprocessor.input()),
  );
  protected readonly groups = [
    {
      label: 'Wing',
      focus: { part: 'span' },
      settings: [
        {
          key: 'area',
          label: 'Flat area',
          hint: 'Before Wing scale.',
          step: 0.1,
          format: (value: number) => `${value.toFixed(1)} m²`,
        },
        {
          key: 'aspectRatio',
          label: 'Flat aspect ratio',
          hint: 'Span² over area.',
          step: 0.05,
          format: (value: number) => value.toFixed(2),
        },
      ],
    },
    {
      label: 'Planform',
      focus: { part: 'span' },
      settings: [
        {
          key: 'taper',
          label: 'Tip chord',
          hint: 'Of the central chord.',
          step: 0.01,
          format: percent,
        },
        {
          key: 'sweep',
          label: 'Sweep',
          hint: 'The share of the chord lost at the tip taken by the leading edge.',
          step: 0.01,
          format: percent,
        },
        {
          key: 'leadingEdgeRoundness',
          label: 'Leading edge roundness',
          hint: 'From a flat curve to a tip square to the span.',
          step: 0.01,
          format: percent,
        },
        {
          key: 'trailingEdgeRoundness',
          label: 'Trailing edge roundness',
          hint: 'From a flat curve to a tip square to the span.',
          step: 0.01,
          format: percent,
        },
      ],
    },
    {
      label: 'Vault',
      focus: { part: 'vault' },
      settings: [
        {
          key: 'tipAngle',
          label: 'Tip angle',
          hint: 'The vault inclination at the tip.',
          step: 1,
          format: (value: number) => `${Math.round(value)}°`,
        },
        {
          key: 'tipCurl',
          label: 'Tip curl',
          hint: 'The share of that angle in the tip arc: a flatter center and a sharper tip.',
          step: 0.01,
          format: percent,
        },
      ],
    },
    {
      label: 'Cells',
      focus: { part: 'cells' },
      settings: [
        {
          key: 'cells',
          label: 'Cells',
          hint: 'Over the whole wing.',
          step: 1,
          format: String,
        },
        {
          key: 'cellUniformity',
          label: 'Cell uniformity',
          hint: 'From widths proportional to chord to uniform widths.',
          step: 0.01,
          format: percent,
        },
      ],
    },
  ] as const;

  protected replace(shape: WingShape): void {
    confirmShape(
      this.dialogs,
      this.losses(),
      this.editor.preprocessor.input(),
      'Replace with the Auto shape',
    ).subscribe((confirmed) => {
      if (confirmed) this.editor.preprocessor.applyShape(shape);
    });
  }

  protected setShape(key: keyof WingShape, event: Event): void {
    const shape = this.shape();
    if (shape)
      this.editor.preprocessor.applyShape({
        ...shape,
        [key]: (event.target as HTMLInputElement).valueAsNumber,
      });
  }
}
