import type { CellDistribution, Diagnostic, PreprocessorInput } from './model.ts';

/** Total cell count; explicit widths describe the half wing, a zero first width an even count. */
export function cellCount(d: CellDistribution): number {
  return d.mode === 4 ? d.widths.length * 2 - (d.widths[0] === 0 ? 2 : 1) : d.cells;
}

export function validatePreprocessor(input: PreprocessorInput): Diagnostic[] {
  const errors: Diagnostic[] = [];
  const check = (valid: boolean, field: string, message: string) => {
    if (!valid) errors.push({ severity: 'error', field, message });
  };
  const positive = (value: number, field: string) =>
    check(Number.isFinite(value) && value > 0, field, 'Must be a finite positive number');
  const finite = (value: number, field: string) =>
    check(Number.isFinite(value), field, 'Must be a finite number');
  // Fortran reads the name and never uses it: one record, no control characters.
  check(
    input.name.length > 0 && ![...input.name].some((c) => c < ' ' || c === '\x7f'),
    'name',
    'Use a non-empty name without control characters',
  );
  const halfSpan = input.halfSpan;
  positive(halfSpan, 'halfSpan');
  for (const [key, edge] of [
    ['leadingEdge', input.leadingEdge],
    ['trailingEdge', input.trailingEdge],
  ] as const) {
    positive(edge.a, `${key}.a`);
    positive(edge.b, `${key}.b`);
    check(
      edge.a >= halfSpan,
      `${key}.a`,
      'Ellipse horizontal radius must be at least the half span',
    );
    check(
      Number.isFinite(edge.x1) && edge.x1 >= 0 && edge.x1 < halfSpan,
      `${key}.x1`,
      'Correction start must be between zero and the half span (excluded)',
    );
  }
  const le = input.leadingEdge;
  const te = input.trailingEdge;
  check(
    Number.isFinite(le.x2) && le.x2 >= le.x1 && le.x2 < halfSpan,
    'leadingEdge.x2',
    'Second correction must start at or after the first, before the half span',
  );
  positive(le.exponent1, 'leadingEdge.exponent1');
  positive(le.exponent2, 'leadingEdge.exponent2');
  positive(te.exponent, 'trailingEdge.exponent');
  finite(le.correction1, 'leadingEdge.correction1');
  finite(le.correction2, 'leadingEdge.correction2');
  finite(te.correction, 'trailingEdge.correction');
  finite(te.offset, 'trailingEdge.offset');
  check(le.b + te.b > te.offset, 'trailingEdge.offset', 'Central chord must be positive');
  const vault = input.vault;
  if (vault.mode === 1) {
    positive(vault.a, 'vault.a');
    positive(vault.b, 'vault.b');
    finite(vault.correction, 'vault.correction');
    check(
      Number.isFinite(vault.x1) && vault.x1 > 0 && vault.x1 < vault.a,
      'vault.x1',
      'Correction start must be inside the ellipse, greater than zero',
    );
  } else if (vault.mode === 2) {
    check(vault.arcs.length === 4, 'vault.arcs', 'Exactly four tangent arcs are required');
    vault.arcs.forEach((arc, i) => {
      positive(arc.radius, `vault.arcs[${i}].radius`);
      positive(arc.angle, `vault.arcs[${i}].angle`);
    });
    check(
      vault.arcs.reduce((sum, arc) => sum + arc.angle, 0) < 180,
      'vault.arcs',
      'Total half-wing angle must be less than 180 degrees',
    );
  } else {
    check(false, 'vault.mode', 'Expected vault mode 1 or 2');
  }
  const d = input.distribution;
  if (d.mode === 4) {
    check(
      d.widths.length >= 2 && d.widths.length <= 100,
      'distribution.widths',
      'Use 2–100 half-wing widths',
    );
    d.widths.forEach((width, i) => {
      check(
        Number.isFinite(width) && (i === 0 ? width === 0 || width >= 0.01 : width > 0),
        `distribution.widths[${i}]`,
        'Widths must be positive; the first may be zero for an even cell count (otherwise at least 0.01 cm)',
      );
    });
  } else {
    check(
      [1, 2, 3].includes(d.mode),
      'distribution.mode',
      'Expected distribution mode 1, 2, 3 or 4',
    );
    if (d.mode === 2 || d.mode === 3) {
      check(
        Number.isFinite(d.coefficient) && d.coefficient >= 0 && d.coefficient <= 1,
        'distribution.coefficient',
        'Coefficient must be between zero and one',
      );
    }
  }
  const cells = cellCount(d);
  check(
    Number.isInteger(cells) && cells >= 2 && cells <= 199,
    'distribution.cells',
    'Cell count must be an integer from 2 to 199',
  );
  return errors;
}
