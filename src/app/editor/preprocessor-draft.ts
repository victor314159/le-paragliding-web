import { computed, signal, type Signal, type WritableSignal } from '@angular/core';
import type { FieldTree } from '@angular/forms/signals';
import {
  applyGeometry,
  fromShape,
  shapeLosses,
  shapeOf,
  type ShapePart,
  type WingShape,
} from '@lepara/design';
import type { Diagnostic } from '@lepara/format';
import {
  ARC_VAULT_DEFAULTS,
  DISTRIBUTION_DEFAULTS,
  ELLIPSE_VAULT_DEFAULTS,
  PREPROCESSOR_EXAMPLE,
  PRE_DATA_FILE,
  cellCount,
  generateGeometry,
  type CellDistribution,
  type GeometryResult,
  type PreprocessorInput,
  type Result,
  type Vault,
} from '@lepara/preprocessor';
import { dequal } from 'dequal';
import { toDesign, type AllModes, type DesignForm, type Nullable } from './editor-draft';

/**
 * Explicit widths start with the central cell, or with a zero for a central
 * rib: the form keeps that choice in `center` and leaves out the zero.
 */
export type PreprocessorForm = Nullable<
  Omit<PreprocessorInput, 'vault' | 'distribution'> & {
    readonly vault: AllModes<Vault>;
    readonly distribution: AllModes<CellDistribution> & { readonly center: 'rib' | 'cell' };
  }
>;

/** `cells` even widths over the span, as explicit widths of the half wing. */
const evenWidths = (cells: number, halfSpan: number) => ({
  center: cells % 2 === 0 ? ('rib' as const) : ('cell' as const),
  widths: Array.from({ length: Math.ceil(cells / 2) }, () => (2 * halfSpan) / cells),
});

export function toPreprocessorForm(input: PreprocessorInput): PreprocessorForm {
  const d = input.distribution;
  const cells = cellCount(d);
  const center = cells % 2 === 0 ? 'rib' : 'cell';
  return {
    ...input,
    vault: { ...ELLIPSE_VAULT_DEFAULTS, ...ARC_VAULT_DEFAULTS, ...input.vault },
    distribution: {
      mode: d.mode,
      cells,
      coefficient: d.mode === 2 || d.mode === 3 ? d.coefficient : DISTRIBUTION_DEFAULTS.coefficient,
      ...(d.mode === 4
        ? { center, widths: d.widths.slice(center === 'rib' ? 1 : 0) }
        : evenWidths(cells, input.halfSpan)),
    },
  };
}

/**
 * Switching to explicit widths keeps them if they have the cell count of the
 * previous mode; otherwise they become even widths of that count.
 */
export function toExplicitWidths(value: PreprocessorForm): PreprocessorForm {
  const { distribution: d, halfSpan } = value;
  const explicitCells = d.widths.length * 2 - (d.center === 'rib' ? 0 : 1);
  if (
    d.cells === null ||
    !Number.isInteger(d.cells) ||
    d.cells < 2 ||
    halfSpan === null ||
    explicitCells === d.cells
  )
    return value;
  return { ...value, distribution: { ...d, ...evenWidths(d.cells, halfSpan) } };
}

/** Only the selected modes go to the preprocessor, as in `toDesign`. */
export function toPreprocessorInput(value: PreprocessorForm): PreprocessorInput {
  const { vault: v, distribution: d } = value;
  return {
    ...value,
    vault:
      v.mode === 1
        ? { mode: 1, a: v.a, b: v.b, x1: v.x1, correction: v.correction }
        : { mode: v.mode, arcs: v.arcs },
    distribution:
      d.mode === 4
        ? { mode: 4, widths: d.center === 'rib' ? [0, ...d.widths] : d.widths }
        : d.mode === 1
          ? { mode: 1, cells: d.cells }
          : { mode: d.mode, cells: d.cells, coefficient: d.coefficient },
  } as PreprocessorInput;
}

/** The path of a preprocessor field in the form: explicit widths leave out the central zero. */
function formField(field: string, value: PreprocessorForm): string {
  if (value.distribution.center !== 'rib') return field;
  return field.replace(/^distribution\.widths\[(\d+)\]/, (_, i: string) =>
    Number(i) > 0 ? `distribution.widths[${Number(i) - 1}]` : 'distribution.widths',
  );
}

/**
 * The rib table of `result` in the form. The rows keep the columns that the
 * table does not use, as the form keeps them.
 */
export function applyGeneratedGeometry(form: DesignForm, result: GeometryResult): DesignForm {
  const { cells, ribCount, ribs } = applyGeometry(toDesign(form), result);
  const kept = form.geometry.ribs;
  return {
    ...form,
    geometry: {
      ...form.geometry,
      cells,
      ribCount,
      ribs: ribs.map((rib, i) => ({ ...(kept.at(i) ?? { rotZ: 0, rotZPosition: 0 }), ...rib })),
    },
  };
}

export type PreprocessorFormTree = FieldTree<PreprocessorForm>;

/**
 * The parameters of pre-data.txt and the geometry they generate. A missing
 * file is created from given parameters, until discarded; an unreadable one
 * is never replaced; removing it is done in the file list.
 * Plain signals: EditorState binds their form.
 */
export class PreprocessorDraft {
  /** pre-data.txt exists, read or not. */
  readonly exists: boolean;
  /** pre-data.txt exists but could not be read: it is edited as text. */
  readonly unreadable: boolean;
  /** The errors of reading pre-data.txt. */
  readonly readingErrors: readonly Diagnostic[];
  /** Read from pre-data.txt, or created: the parameters can be edited. */
  readonly loaded: WritableSignal<boolean>;
  readonly value: WritableSignal<PreprocessorForm>;
  readonly input: Signal<PreprocessorInput>;
  readonly result: Signal<Result<GeometryResult>>;
  /** The errors of generating, on the fields of the form. */
  readonly errors: Signal<readonly Diagnostic[]>;
  /** Saving writes pre-data.txt: it was created, or its parameters changed. */
  readonly changed: Signal<boolean>;
  /** The shape of the parameters, if they generate a wing. */
  readonly shape: Signal<WingShape | undefined>;
  /** What applying that shape replaces: none when the parameters are a shape's. */
  readonly shapeLosses: Signal<readonly ShapePart[]>;

  constructor(reading?: Result<PreprocessorInput>) {
    this.exists = !!reading;
    this.unreadable = reading?.ok === false;
    this.readingErrors = reading?.ok === false ? reading.errors : [];
    const read = reading?.ok ? reading.value : undefined;
    this.loaded = signal(!!read);
    // Without a file, a placeholder until `create`.
    this.value = signal(toPreprocessorForm(read ?? PREPROCESSOR_EXAMPLE));
    this.input = computed(() => toPreprocessorInput(this.value()));
    this.result = computed(() => generateGeometry(this.input()));
    this.errors = computed(() => {
      const result = this.result();
      return result.ok
        ? []
        : result.errors.map((error) => ({
            ...error,
            file: PRE_DATA_FILE,
            field: error.field && formField(error.field, this.value()),
          }));
    });
    this.changed = computed(() => this.loaded() && !dequal(this.input(), read));
    this.shape = computed(() => {
      const result = this.result();
      return result.ok ? shapeOf(this.input(), result.value) : undefined;
    });
    this.shapeLosses = computed(() => {
      const shape = this.shape();
      return shape ? shapeLosses(shape, this.input()) : [];
    });
  }

  /** Starts from `input`, without a file. */
  create(input: PreprocessorInput): void {
    if (this.exists) return;
    this.value.set(toPreprocessorForm(input));
    this.loaded.set(true);
  }

  /** Sets the parameters of `shape`: the modes it does not use keep their values, as in Manual. */
  applyShape(shape: WingShape): void {
    const input = fromShape(shape, this.input());
    this.value.update((form) => ({
      ...form,
      ...input,
      vault: { ...form.vault, ...input.vault },
      distribution: { ...form.distribution, ...input.distribution },
    }));
  }

  /** Cancels `create`: nothing is written. */
  discard(): void {
    if (!this.exists) this.loaded.set(false);
  }
}
