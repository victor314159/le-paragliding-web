import { computed, signal, type Signal } from '@angular/core';
import { form, validateTree, type FieldTree, type ReadonlyFieldTree } from '@angular/forms/signals';
import {
  validate,
  validateDesign,
  type Diagnostic,
  type Dxf2d,
  type Dxf3d,
  type LepProject,
  type SewingAllowances,
} from '@lepara/format';
import { dequal } from 'dequal';
import { withSeverity } from '../shared/diagnostics';

/** A DXF section with the fields of mode 1 in every mode: hidden fields keep their input. */
type AllModes<T extends { mode: number }> = Omit<Extract<T, { mode: 1 }>, 'mode'> & Pick<T, 'mode'>;

/** The sections the editor changes. */
interface Edited {
  readonly sewingAllowances: SewingAllowances;
  readonly dxf2d: AllModes<Dxf2d>;
  readonly dxf3d: AllModes<Dxf3d>;
}

/**
 * A model value with each number as text, so unfinished input ('', '-', '1.')
 * stays as typed. Field paths are those of the model, as in diagnostics.
 */
type Text<T> = T extends number ? string : { [K in keyof T]: Text<T[K]> };

export type EditorForm = FieldTree<Text<Edited>>;
export type SewingForm = EditorForm['sewingAllowances'];
export type Dxf2dForm = EditorForm['dxf2d'];
export type Dxf3dForm = EditorForm['dxf3d'];
export type ColorForm = Dxf2dForm['lineColors'];

// Switching to mode 1 starts from the colors the 3.29 engine uses in mode 0.
const DXF2D_DEFAULTS: AllModes<Dxf2d> = { mode: 0, lineColors: [1, 30, 3, 4, 6, 5] };
const DXF3D_DEFAULTS: AllModes<Dxf3d> = {
  mode: 0,
  lineColors: [8, 8, 8, 8, 8, 30],
  surfaces: [
    { drawn: 0, color: 5 },
    { drawn: 0, color: 1 },
    { drawn: 0, color: 3 },
  ],
};

// A decimal number, as the engine reads it: no hexadecimal, no Infinity.
const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/** Applies `leaf` to each number or text of a model value. */
function mapLeaves(value: unknown, leaf: (value: number | string) => unknown): unknown {
  if (typeof value === 'number' || typeof value === 'string') return leaf(value);
  if (Array.isArray(value)) return value.map((item) => mapLeaves(item, leaf));
  return Object.fromEntries(
    Object.entries(value as object).map(([key, item]) => [key, mapLeaves(item, leaf)]),
  );
}

const toText = <T>(value: T) => mapLeaves(value, String) as Text<T>;

/** Blank or malformed numbers are NaN, which `validate` reports. */
const fromText = <T>(text: Text<T>) =>
  mapLeaves(text, (raw) => (NUMBER.test(String(raw).trim()) ? Number(raw) : NaN)) as T;

/** The field at a model path such as `dxf3d.surfaces[0].color`, if the form has it. */
export function fieldAt(
  tree: ReadonlyFieldTree<unknown>,
  path: string,
): ReadonlyFieldTree<unknown> | undefined {
  let field: unknown = tree;
  for (const key of path.split(/[.[\]]+/).filter(Boolean)) {
    field = (field as Record<string, unknown> | undefined)?.[key];
  }
  return field as ReadonlyFieldTree<unknown> | undefined;
}

function toProject(initial: LepProject, { sewingAllowances, dxf2d, dxf3d }: Edited): LepProject {
  return {
    airfoils: initial.airfoils,
    design: {
      ...initial.design,
      sewingAllowances,
      // Only the fields of the selected mode are written.
      dxf2d: dxf2d.mode === 0 ? { mode: 0 } : { ...dxf2d, mode: 1 },
      dxf3d: dxf3d.mode === 0 ? { mode: 0 } : { ...dxf3d, mode: 1 },
    },
  };
}

/**
 * The input of the edited sections, validated by @lepara/format. The design
 * errors block Save, since writeLep refuses them: those of the edited sections
 * on their fields, the others on the form. The other errors, such as a missing
 * or unreadable airfoil, are shown without blocking.
 */
export class EditorDraft {
  readonly form: EditorForm;
  readonly project: Signal<LepProject>;
  readonly diagnostics: Signal<readonly Diagnostic[]>;
  /** The errors that block Save. */
  readonly errors: Signal<readonly Diagnostic[]>;
  /** Saving rewrites leparagliding.txt. */
  readonly changed: Signal<boolean>;

  /** Call in an injection context. */
  constructor(initial: LepProject, reading: readonly Diagnostic[] = []) {
    const { sewingAllowances, dxf2d, dxf3d } = initial.design;
    const input = signal(
      toText<Edited>({
        sewingAllowances,
        dxf2d: dxf2d.mode === 1 ? dxf2d : DXF2D_DEFAULTS,
        dxf3d: dxf3d.mode === 1 ? dxf3d : DXF3D_DEFAULTS,
      }),
    );
    this.project = computed(() => toProject(initial, fromText<Edited>(input())));
    this.diagnostics = computed(() => validate(this.project(), { reading }));
    this.errors = computed(() => withSeverity(validateDesign(this.project().design), 'error'));
    this.changed = computed(() => !dequal(this.project().design, initial.design));
    this.form = form(input, (path) => {
      validateTree(path, ({ fieldTree }) =>
        this.errors().map(({ field, message }) => ({
          kind: 'format',
          message,
          fieldTree: (field && fieldAt(fieldTree, field)) || fieldTree,
        })),
      );
    });
  }
}
