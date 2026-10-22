// Sequential formatted input as the engine reads it (gfortran and flang
// agree on everything accepted here): records, list-directed READs,
// '(A)' READs and BACKSPACE. Each READ starts on a new record and drops the
// end of its last record once its list is complete.
import { FormatError, type Diagnostic } from './result.ts';

/** Destination type of a list item, as declared (or implied) in the engine. */
export type FortranType = 'integer' | 'real8' | { readonly character: number };

export interface Item {
  readonly type: FortranType;
  /** The Fortran variable, for messages: `ncells`, `rib(i,2)`. */
  readonly name: string;
  /** The model field it fills, for messages and diagnostics. */
  readonly field?: string;
  /**
   * The variable's value before this READ, when the engine determined it
   * (an earlier read of the same record): a null value or a slash keeps it.
   * Without it, a null value is an error.
   */
  readonly prior?: number | string;
}

export const integer = (name: string, field?: string, prior?: number): Item => ({
  type: 'integer',
  name,
  field,
  prior,
});
export const real8 = (name: string, field?: string, prior?: number): Item => ({
  type: 'real8',
  name,
  field,
  prior,
});
export const character = (length: number, name: string, field?: string, prior?: string): Item => ({
  type: { character: length },
  name,
  field,
  prior,
});

interface Position {
  readonly line: number;
  readonly column: number;
}

type Token =
  | ({ readonly kind: 'value'; readonly text: string; readonly quoted: boolean } & Position)
  | ({ readonly kind: 'null' } & Position)
  | ({ readonly kind: 'slash' } & Position);

// Blanks of list-directed input. A CR (CRLF files) is a blank too.
const isBlank = (c: string | undefined) => c === ' ' || c === '\t' || c === '\r';
const endsValue = (c: string | undefined) =>
  c === undefined || isBlank(c) || c === ',' || c === '/';

const INTEGER = /^[+-]?\d+$/;
// Mantissa with an optional point, exponent with a letter (E, D or Q) or
// only a sign: 1, 1., .5, 1.5e3, 1d0, 1q0, 1.0+5.
const REAL = /^([+-]?(?:\d+\.?\d*|\.\d+))(?:[eEdDqQ]([+-]?\d+)|([+-]\d+))?$/;
// Accepted by gfortran, refused here: a design with them has no meaning.
const NOT_FINITE = /^[+-]?(?:inf(?:inity)?|nan(?:\(.*\))?)$/i;
// gfortran refuses larger repeat counts (Repeat count overflow); flang
// aborts on some of them.
const MAX_REPEAT = 200000000;

/**
 * Scans the values of one list-directed READ over `records`, from the start
 * of record `start`: values, nulls (`,,`, `n*`), repeats (`n*v`) and `/`.
 */
class ListScanner {
  record: number;
  private column = 0;
  // A value was read and its separator is not consumed yet.
  private afterValue = false;
  private repeat = 0;
  private repeated: Token | undefined;

  private readonly records: readonly string[];
  private readonly onEnd: (position: Position) => never;
  private readonly onError: ((position: Position, message: string) => never) | undefined;

  constructor(
    records: readonly string[],
    start: number,
    onEnd: (position: Position) => never,
    onError?: (position: Position, message: string) => never,
  ) {
    this.records = records;
    this.record = start;
    this.onEnd = onEnd;
    this.onError = onError;
  }

  /** The next value, null or slash; calls onEnd at the end of the file. */
  next(): Token {
    if (this.repeat > 0) {
      this.repeat--;
      return this.repeated!;
    }
    for (;;) {
      const line = this.records[this.record];
      if (line === undefined) return this.onEnd(this.position());
      const c = line[this.column];
      if (c === undefined) {
        // The end of a record is a blank.
        this.record++;
        this.column = 0;
        continue;
      }
      if (isBlank(c)) {
        this.column++;
        continue;
      }
      const position = this.position();
      if (c === ',') {
        this.column++;
        if (this.afterValue) {
          this.afterValue = false;
          continue;
        }
        return { kind: 'null', ...position };
      }
      if (c === '/') {
        this.column++;
        return { kind: 'slash', ...position };
      }
      this.afterValue = true;
      const count = /^(\d+)\*/.exec(line.slice(this.column));
      if (count) {
        const times = Number(count[1]);
        if (times === 0) this.fail(position, 'A repeat count must not be zero');
        if (times > MAX_REPEAT) {
          this.fail(position, `A repeat count is at most ${MAX_REPEAT}: ${count[1]}`);
        }
        this.column += count[0].length;
        const value: Token = endsValue(line[this.column])
          ? { kind: 'null', ...position }
          : this.constant(position);
        this.repeat = times - 1;
        this.repeated = value;
        return value;
      }
      return this.constant(position);
    }
  }

  private constant(position: Position): Token {
    const line = this.records[this.record];
    const quote = line[this.column];
    if (quote === '"' || quote === "'") return this.quoted(quote, position);
    let end = this.column;
    while (!endsValue(line[end])) end++;
    const text = line.slice(this.column, end);
    this.column = end;
    if (text.includes(';')) this.fail(position, `Unsupported ";" in "${text}"`);
    return { kind: 'value', text, quoted: false, ...position };
  }

  // A delimited character constant: a doubled delimiter stands for one, and
  // the constant may continue on the next records (the ends of records are
  // not part of it).
  private quoted(quote: string, position: Position): Token {
    this.column++;
    let text = '';
    for (;;) {
      const line = this.records[this.record];
      if (line === undefined) this.fail(position, 'Unterminated character constant');
      const end = line.indexOf(quote, this.column);
      if (end < 0) {
        text += line.slice(this.column);
        this.record++;
        this.column = 0;
        continue;
      }
      text += line.slice(this.column, end);
      this.column = end + 1;
      if (line[this.column] === quote) {
        text += quote;
        this.column++;
        continue;
      }
      if (!endsValue(line[this.column])) {
        this.fail(this.position(), 'Unexpected character after a character constant');
      }
      return { kind: 'value', text, quoted: true, ...position };
    }
  }

  private position(): Position {
    return { line: this.record + 1, column: this.column + 1 };
  }

  // A lexical error: the reader adds the file, section and field.
  fail(position: Position, message: string): never {
    this.onError?.(position, message);
    throw new FormatError({ message, ...position });
  }
}

/** A file read record by record, like the engine's units 22 and 24. */
export class FortranReader {
  private readonly records: string[];
  /** The next record to read (0-based). */
  private next = 0;
  /** The section being read, for diagnostics. */
  section: number | undefined;

  readonly file: string;
  private readonly warnings: Diagnostic[];

  constructor(text: string, file: string, warnings: Diagnostic[]) {
    this.file = file;
    this.warnings = warnings;
    // A CR before the LF belongs to the end of the record (CRLF files).
    this.records = text.split('\n').map((line) => line.replace(/\r$/, ''));
    if (this.records.at(-1) === '') this.records.pop();
  }

  /** `read (u,*)` with an empty list: skips one record. */
  skip(what = 'a comment line'): void {
    if (this.next >= this.records.length) this.endOfFile(what);
    this.next++;
  }

  /** `read (u,'(A)',end=…)`: the next record, or undefined at the end. */
  line(): string | undefined {
    return this.records[this.next++];
  }

  backspace(): void {
    if (this.next > 0) this.next--;
  }

  // Where each value of the last read() came from.
  private positions: Position[] = [];
  /** Where each model field was last read from. */
  readonly fieldPositions = new Map<string, Position>();

  /** An error on the value `index` of the last read(). */
  failAt(index: number, message: string, field?: string): never {
    const position = this.positions[index] ?? { line: this.lineNumber - 1, column: 1 };
    throw new FormatError({
      message,
      ...this.where(position),
      ...(field !== undefined && { field }),
    });
  }

  /** The 1-based line number of the next record. */
  get lineNumber(): number {
    return this.next + 1;
  }

  /** `read (u,*) items`: their values, in order. */
  read(items: readonly Item[]): (number | string)[] {
    const what = items[0]?.field ?? items[0]?.name ?? 'a value';
    if (this.next >= this.records.length) this.endOfFile(what);
    let item = 0;
    const scanner = new ListScanner(
      this.records,
      this.next,
      (position) =>
        this.fail(position, `The file ends while reading ${describe(items[item])}`, items[item]),
      (position, message) => this.fail(position, message, items[item]),
    );
    const values: (number | string)[] = [];
    const positions: Position[] = [];
    this.positions = positions;
    let ended = false;
    for (; item < items.length; item++) {
      const spec = items[item];
      const token = ended ? undefined : scanner.next();
      if (token?.kind === 'slash') ended = true;
      const position = token ?? { line: scanner.record + 1, column: 1 };
      positions.push(position);
      if (spec.field !== undefined && !spec.name.startsWith('gname')) {
        this.fieldPositions.set(spec.field, { line: position.line, column: position.column });
      }
      if (!token || token.kind !== 'value') {
        if (spec.prior === undefined) {
          this.fail(
            position,
            `No value for ${describe(spec)}: a null value or "/" keeps the previous value, and it has none`,
            spec,
          );
        }
        values.push(spec.prior);
        continue;
      }
      values.push(this.convert(token, spec));
    }
    this.next = scanner.record + 1;
    return values;
  }

  /**
   * Reads pairs of reals until the end of the file, like the loop of the
   * engine's `datair` (`read (24,*,iostat=io) u, v`).
   */
  readPairsToEnd(name: string, field: (index: number) => string): [number, number][] {
    const pairs: [number, number][] = [];
    // The values end at the last record that is not blank.
    let end = this.records.length;
    while (end > this.next && !/[^ \t\r]/.test(this.records[end - 1])) end--;
    while (this.next < end) {
      const index = pairs.length;
      const [u, v] = this.read([
        real8(`${name}(j,1)`, `${field(index)}[0]`),
        real8(`${name}(j,2)`, `${field(index)}[1]`),
      ]) as [number, number];
      pairs.push([u, v]);
    }
    this.next = this.records.length;
    return pairs;
  }

  private convert(token: Extract<Token, { kind: 'value' }>, spec: Item): number | string {
    const { type } = spec;
    if (typeof type === 'object') {
      const { value, truncated } = truncateBytes(token.text, type.character);
      if (truncated === 'split') {
        this.fail(
          token,
          `${describe(spec)} holds ${type.character} bytes: "${token.text}" would be cut inside a character`,
          spec,
        );
      }
      if (truncated) {
        this.warnings.push({
          severity: 'warning',
          message: `${describe(spec)} holds ${type.character} bytes: "${token.text}" is read as "${value}"`,
          ...this.where(token, spec),
        });
      }
      return value.replace(/ +$/, '');
    }
    if (token.quoted) {
      this.fail(token, `Expected a number for ${describe(spec)}, found a character constant`, spec);
    }
    if (type === 'integer') {
      const n = INTEGER.test(token.text) ? Number(token.text) : NaN;
      if (!Number.isSafeInteger(n)) {
        this.fail(token, `Expected an integer for ${describe(spec)}, found "${token.text}"`, spec);
      }
      if (n < -2147483648 || n > 2147483647) {
        this.fail(token, `${describe(spec)} is out of the integer range: ${token.text}`, spec);
      }
      return n === 0 ? 0 : n;
    }
    if (NOT_FINITE.test(token.text)) {
      this.fail(token, `${describe(spec)} must be a finite number, not ${token.text}`, spec);
    }
    const match = REAL.exec(token.text);
    if (!match) {
      this.fail(token, `Expected a real number for ${describe(spec)}, found "${token.text}"`, spec);
    }
    const n = Number(`${match[1]}e${match[2] ?? match[3] ?? '0'}`);
    if (!Number.isFinite(n)) {
      this.fail(
        token,
        `${describe(spec)} is out of the double precision range: ${token.text}`,
        spec,
      );
    }
    return n;
  }

  private where(position: Position, spec?: Item) {
    return {
      file: this.file,
      ...(this.section !== undefined && { section: this.section }),
      ...(spec?.field !== undefined && { field: spec.field }),
      line: position.line,
      column: position.column,
    };
  }

  fail(position: Position, message: string, spec?: Item): never {
    throw new FormatError({ message, ...this.where(position, spec) });
  }

  /** An error at the start of the next record. */
  failHere(message: string, field?: string, lineNumber = this.lineNumber): never {
    throw new FormatError({
      message,
      ...this.where({ line: lineNumber, column: 1 }),
      ...(field !== undefined && { field }),
    });
  }

  private endOfFile(what: string): never {
    this.fail({ line: this.records.length + 1, column: 1 }, `The file ends before ${what}`);
  }
}

const describe = (spec: Item) => (spec.field ? `${spec.field} (${spec.name})` : spec.name);

/**
 * The number of values a list-directed READ of `line` into
 * `character(100) words(1000)` leaves non-blank: how the engine counts the
 * columns of a table (`read (entireline,*,iostat=ierr) words`, then
 * `count(words /= "")`: only spaces are blank, in the first 100 bytes).
 */
export function countWords(line: string): number {
  // entireline is character(len=1000): longer records are cut (bytes).
  const records = [truncateBytes(line, 1000).value];
  let count = 0;
  const scanner = new ListScanner(records, 0, () => {
    throw new EndOfRecord();
  });
  try {
    for (let i = 0; i < 1000; i++) {
      const token = scanner.next();
      if (token.kind === 'slash') break;
      if (token.kind !== 'value') continue;
      const { value, truncated } = truncateBytes(token.text, 100);
      // A character cut by the truncation leaves bytes that are not blank.
      if (/[^ ]/.test(value) || truncated === 'split') count++;
    }
  } catch (error) {
    if (!(error instanceof EndOfRecord)) throw error;
  }
  return count;
}

class EndOfRecord extends Error {}

/** UTF-8 byte length of `text`. */
export function byteLength(text: string): number {
  let bytes = 0;
  for (const c of text) {
    const code = c.codePointAt(0)!;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

// List-directed assignment to character*n keeps the leftmost n bytes.
function truncateBytes(
  text: string,
  length: number,
): { value: string; truncated: boolean | 'split' } {
  let bytes = 0;
  let value = '';
  for (const c of text) {
    const size = byteLength(c);
    if (bytes + size > length) return { value, truncated: bytes < length ? 'split' : true };
    bytes += size;
    value += c;
  }
  return { value, truncated: false };
}
