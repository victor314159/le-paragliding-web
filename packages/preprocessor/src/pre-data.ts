import type { CircularArc, PreprocessorInput, Result } from './model.ts';
import { validatePreprocessor } from './validate.ts';

export const PRE_DATA_FILE = 'pre-data.txt';
const separator = '**********************************';

/**
 * Read the fixed records of pre-data.txt 1.6; headings and parameter labels are ignored by Fortran.
 * Like `parseLep`, it does not validate the values: see `validatePreprocessor`.
 */
export function parsePreData(text: string): Result<PreprocessorInput> {
  const lines = text
    .replace(/^\uFEFF/, '')
    .replace(/\r/g, '')
    .split('\n');
  let cursor = 0;
  const record = () => {
    if (cursor >= lines.length) throw new Error('Unexpected end of pre-data.txt');
    return lines[cursor++];
  };
  const skip = (count: number) => {
    for (let i = 0; i < count; i++) record();
  };
  const numbers = (label = false, count = 1) => {
    const tokens = record()
      .split('!')[0]
      .trim()
      .split(/[\s,]+/);
    const start = label ? 1 : 0;
    const values = tokens.slice(start, start + count).map((token) => {
      if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eEdD][+-]?\d+)?$/.test(token))
        throw new Error(`Invalid number: ${token}`);
      const value = Number(token.replace(/[dD]/, 'e'));
      if (!Number.isFinite(value)) throw new Error('Expected a finite number');
      return value;
    });
    if (values.length !== count) throw new Error('Missing number');
    return values;
  };
  /** One labelled record per key, in order. */
  const fields = <K extends string>(...keys: K[]) =>
    Object.fromEntries(keys.map((key) => [key, numbers(true)[0]])) as Record<K, number>;
  const mode = (allowed: readonly number[]) => {
    const value = numbers()[0];
    if (!allowed.includes(value)) throw new Error(`Unsupported mode: ${value}`);
    return value;
  };
  try {
    skip(4);
    const nameRecord = record().trim();
    let name = nameRecord.split(/[\s,/]/)[0];
    const quote = nameRecord[0];
    if (quote === "'" || quote === '"') {
      name = '';
      let closed = false;
      for (let i = 1; i < nameRecord.length; i++) {
        const c = nameRecord[i];
        if (c === quote) {
          if (nameRecord[i + 1] !== quote) {
            closed = true;
            break;
          }
          i++;
        }
        name += c;
      }
      if (!closed) throw new Error('Unterminated quoted wing name');
    }
    skip(3);
    mode([1]);
    const { halfSpan, ...leadingEdge } = fields(
      'a',
      'b',
      'x1',
      'x2',
      'halfSpan',
      'correction1',
      'exponent1',
      'correction2',
      'exponent2',
    );
    skip(3);
    mode([1]);
    const { halfSpan: trailingHalfSpan, ...trailingEdge } = fields(
      'a',
      'b',
      'x1',
      'halfSpan',
      'correction',
      'offset',
      'exponent',
    );
    if (trailingHalfSpan !== halfSpan)
      throw new Error('The trailing edge xm must equal the leading edge xm');
    skip(3);
    const arc = (): CircularArc => {
      const [radius, angle] = numbers(false, 2);
      return { radius, angle };
    };
    const vault: PreprocessorInput['vault'] =
      mode([1, 2]) === 1
        ? { mode: 1, ...fields('a', 'b', 'x1', 'correction') }
        : { mode: 2, arcs: [arc(), arc(), arc(), arc()] };
    skip(3);
    const distributionMode = mode([1, 2, 3, 4]);
    let distribution: PreprocessorInput['distribution'];
    if (distributionMode === 4) {
      const count = numbers()[0];
      if (!Number.isInteger(count) || count < 2 || count > 100)
        throw new Error('Expected 2–100 half-wing widths');
      const widths = Array.from({ length: count }, () => numbers(false, 2)[1]);
      distribution = { mode: 4, widths };
    } else if (distributionMode === 1) {
      distribution = { mode: 1, cells: numbers()[0] };
    } else {
      distribution = {
        mode: distributionMode as 2 | 3,
        coefficient: numbers()[0],
        cells: numbers()[0],
      };
    }
    return {
      ok: true,
      value: { name, halfSpan, leadingEdge, trailingEdge, vault, distribution },
      warnings: [],
    };
  } catch (error) {
    return {
      ok: false,
      errors: [
        {
          severity: 'error',
          file: PRE_DATA_FILE,
          line: cursor,
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
}

/** Write canonical 1.6 records; original headings, comments and formatting are not retained. */
export function writePreData(input: PreprocessorInput): Result<string> {
  const errors = validatePreprocessor(input);
  if (errors.length) return { ok: false, errors };
  const le = input.leadingEdge;
  const te = input.trailingEdge;
  const lines = [
    separator,
    'LEPARAGLIDING',
    'GEOMETRY PRE-PROCESSOR v1.6',
    separator,
    `'${input.name.replace(/'/g, "''")}'`,
  ];
  const heading = (title: string) => lines.push(separator, title, separator);
  const parameters = (values: readonly (readonly [string, number])[]) => {
    for (const [label, value] of values) lines.push(`${label}= ${value}`);
  };
  heading('1. Leading edge');
  lines.push('1');
  parameters([
    ['a1', le.a],
    ['b1', le.b],
    ['x1', le.x1],
    ['x2', le.x2],
    ['xm', input.halfSpan],
    ['c01', le.correction1],
    ['ex1', le.exponent1],
    ['c02', le.correction2],
    ['ex2', le.exponent2],
  ]);
  heading('2. Trailing edge');
  lines.push('1');
  parameters([
    ['a1', te.a],
    ['b1', te.b],
    ['x1', te.x1],
    ['xm', input.halfSpan],
    ['c0', te.correction],
    ['y0', te.offset],
    ['ex1', te.exponent],
  ]);
  heading('3. Vault');
  const vault = input.vault;
  lines.push(String(vault.mode));
  if (vault.mode === 1)
    parameters([
      ['a1', vault.a],
      ['b1', vault.b],
      ['x1', vault.x1],
      ['c1', vault.correction],
    ]);
  else for (const arc of vault.arcs) lines.push(`${arc.radius} ${arc.angle}`);
  heading('4. Cells');
  const d = input.distribution;
  lines.push(String(d.mode));
  if (d.mode === 4) {
    lines.push(String(d.widths.length));
    d.widths.forEach((width, i) => lines.push(`${i + 1} ${width}`));
  } else {
    if (d.mode !== 1) lines.push(String(d.coefficient));
    lines.push(String(d.cells));
  }
  return { ok: true, value: lines.join('\n') + '\n', warnings: [] };
}
