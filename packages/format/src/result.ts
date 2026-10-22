/** A problem found while reading, validating or writing a file. */
export interface Diagnostic {
  /** Errors make a file unreadable or an object unwritable; warnings do not. */
  readonly severity: 'error' | 'warning';
  readonly message: string;
  /** The file concerned: `leparagliding.txt` or an airfoil name. */
  readonly file?: string;
  /** The section of `leparagliding.txt` (1 to 39). */
  readonly section?: number;
  /** Path of the field in the model, as `lines.plans[0].paths[3].anchorRib`. */
  readonly field?: string;
  /** 1-based line of a reading error. */
  readonly line?: number;
  /** 1-based column of a reading error, in characters (a tab counts as one). */
  readonly column?: number;
}

export type Result<T> =
  | { readonly ok: true; readonly value: T; readonly warnings: readonly Diagnostic[] }
  | { readonly ok: false; readonly errors: readonly Diagnostic[] };

/** Thrown inside the package to stop a reading; turned into a failed Result. */
export class FormatError extends Error {
  readonly diagnostic: Diagnostic;

  constructor(diagnostic: Omit<Diagnostic, 'severity'>) {
    super(diagnostic.message);
    this.diagnostic = { severity: 'error', ...diagnostic };
  }
}

export function failure<T>(errors: readonly Diagnostic[]): Result<T> {
  return { ok: false, errors };
}

/** Runs `read`, turning a thrown FormatError into a failed Result. */
export function attempt<T>(read: (warnings: Diagnostic[]) => T): Result<T> {
  const warnings: Diagnostic[] = [];
  try {
    return { ok: true, value: read(warnings), warnings };
  } catch (error) {
    if (error instanceof FormatError) return failure([error.diagnostic]);
    throw error;
  }
}
