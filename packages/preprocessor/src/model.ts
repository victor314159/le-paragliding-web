/** Geometry preprocessor 1.6. Lengths in cm, angles in degrees. */
export interface PreprocessorInput {
  readonly name: string;
  /** xm, written in both edge records of pre-data.txt. */
  readonly halfSpan: number;
  readonly leadingEdge: {
    readonly a: number;
    readonly b: number;
    readonly x1: number;
    readonly x2: number;
    readonly correction1: number;
    readonly exponent1: number;
    readonly correction2: number;
    readonly exponent2: number;
  };
  readonly trailingEdge: {
    readonly a: number;
    readonly b: number;
    readonly x1: number;
    readonly correction: number;
    readonly offset: number;
    readonly exponent: number;
  };
  readonly vault: Vault;
  readonly distribution: CellDistribution;
}

export interface CircularArc {
  readonly radius: number;
  readonly angle: number;
}

export type Vault =
  | {
      readonly mode: 1;
      readonly a: number;
      readonly b: number;
      readonly x1: number;
      readonly correction: number;
    }
  | {
      readonly mode: 2;
      readonly arcs: readonly [CircularArc, CircularArc, CircularArc, CircularArc];
    };

export type CellDistribution =
  | { readonly mode: 1; readonly cells: number }
  | { readonly mode: 2 | 3; readonly cells: number; readonly coefficient: number }
  /** Half-wing cell widths. A zero first width denotes a central rib (even cell count). */
  | { readonly mode: 4; readonly widths: readonly number[] };

export type Point = readonly [number, number];

/** Structurally compatible with @lepara/format's nine-column RibGeometry. */
export interface GeneratedRib {
  readonly number: number;
  readonly x: number;
  readonly yLE: number;
  readonly yTE: number;
  readonly xp: number;
  readonly z: number;
  readonly beta: number;
  readonly rotationPoint: number;
  readonly washin: number;
}

export interface GeometryResult {
  readonly cells: number;
  readonly ribs: readonly GeneratedRib[];
  /** Half-wing coordinates, with the central leading edge and vault at (0, 0). */
  readonly curves: {
    readonly leadingEdge: readonly Point[];
    readonly trailingEdge: readonly Point[];
    readonly vault: readonly Point[];
  };
  readonly metrics: {
    /** Full wing spans in m and areas in m², as in geometry-out.txt. */
    readonly flatSpan: number;
    readonly projectedSpan: number;
    readonly flatArea: number;
    readonly projectedArea: number;
    readonly flatAspectRatio: number;
    readonly projectedAspectRatio: number;
    readonly flattening: number;
    /** Chords in cm; maximum/minimum refer to the first/last generated rib. */
    readonly maxChord: number;
    readonly meanChord: number;
    readonly minChord: number;
  };
}

/** Same result/diagnostic convention as @lepara/format, without a runtime dependency. */
export interface Diagnostic {
  readonly severity: 'error' | 'warning';
  readonly message: string;
  readonly field?: string;
  readonly file?: string;
  readonly line?: number;
}

export type Result<T> =
  | { readonly ok: true; readonly value: T; readonly warnings: readonly Diagnostic[] }
  | { readonly ok: false; readonly errors: readonly Diagnostic[] };
