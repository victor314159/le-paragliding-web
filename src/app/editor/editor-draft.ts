import { computed, signal, type Signal, type WritableSignal } from '@angular/core';
import type { FieldTree } from '@angular/forms/signals';
import {
  DXF2D_DEFAULTS,
  DXF3D_DEFAULTS,
  validate,
  validateDesign,
  type Diagnostic,
  type Dxf2d,
  type Dxf3d,
  type LepDesign,
  type LepProject,
} from '@lepara/format';
import { dequal } from 'dequal';
import { withSeverity } from '../shared/diagnostics';

/** A section with the fields of mode 1 in every mode: hidden fields keep their input. */
type AllModes<T extends { mode: number }> = Omit<Extract<T, { mode: 1 }>, 'mode'> & Pick<T, 'mode'>;

/** A model value whose numbers may be null: a number field the user empties. */
type Nullable<T> = T extends number
  ? number | null
  : T extends object
    ? { [K in keyof T]: Nullable<T[K]> }
    : T;

/**
 * The value of the form: the design, with the fields of every mode of the
 * sections that have modes. Field paths are those of the model, as in
 * diagnostics.
 */
export type DesignForm = Nullable<
  Omit<LepDesign, 'dxf2d' | 'dxf3d'> & {
    readonly dxf2d: AllModes<Dxf2d>;
    readonly dxf3d: AllModes<Dxf3d>;
  }
>;

export type EditorForm = FieldTree<DesignForm>;

export function toForm(design: LepDesign): DesignForm {
  const { dxf2d, dxf3d } = design;
  return {
    ...design,
    // Switching to mode 1 starts from the values the engine uses in mode 0.
    dxf2d: dxf2d.mode === 1 ? dxf2d : { ...DXF2D_DEFAULTS, mode: 0 },
    dxf3d: dxf3d.mode === 1 ? dxf3d : { ...DXF3D_DEFAULTS, mode: 0 },
  };
}

/** Keeps the fields of the selected modes. Null numbers are left to validateDesign. */
export function toDesign(value: DesignForm): LepDesign {
  const { dxf2d, dxf3d } = value;
  return {
    ...value,
    dxf2d: dxf2d.mode === 1 ? { ...dxf2d, mode: 1 } : { mode: 0 },
    dxf3d: dxf3d.mode === 1 ? { ...dxf3d, mode: 1 } : { mode: 0 },
  } as LepDesign;
}

/**
 * The edited design of a project, validated by @lepara/format. Its design
 * errors block Save, since writeLep refuses them; the other errors, such as a
 * missing or unreadable airfoil, are shown without blocking. Plain signals:
 * EditorState binds its form.
 */
export class EditorDraft {
  readonly value: WritableSignal<DesignForm>;
  readonly project: Signal<LepProject>;
  readonly diagnostics: Signal<readonly Diagnostic[]>;
  /** The errors that block Save. */
  readonly errors: Signal<readonly Diagnostic[]>;
  /** Saving rewrites leparagliding.txt. */
  readonly changed: Signal<boolean>;

  constructor(initial: LepProject, reading: readonly Diagnostic[] = []) {
    this.value = signal(toForm(initial.design));
    this.project = computed(() => ({ ...initial, design: toDesign(this.value()) }));
    const design = computed(() => validateDesign(this.project().design));
    this.diagnostics = computed(() => validate(this.project(), { reading, design: design() }));
    this.errors = computed(() => withSeverity(design(), 'error'));
    this.changed = computed(() => !dequal(this.project().design, initial.design));
  }
}
