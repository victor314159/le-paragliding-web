// Canonical text: one record per READ of the engine, values as tokens its
// list-directed input reads back to the same values.

/** A REAL*8 token: the shortest decimal that reads back to the same double. */
export function formatReal(n: number): string {
  return Object.is(n, -0) ? '-0' : String(n);
}

/** An INTEGER token. */
export function formatInteger(n: number): string {
  return String(n === 0 ? 0 : n);
}

// Undelimited character constants end at a blank, a comma or a slash, and
// may not start with a quote or a repeat count (`3*`). Control characters
// are quoted too.
// eslint-disable-next-line no-control-regex
const PLAIN = /^[^\s\x00-\x1f\x7f,/;'"*]+$/;

/** A CHARACTER token: as is when list-directed input reads it back unchanged, else quoted. */
export function formatString(s: string): string {
  return PLAIN.test(s) ? s : `"${s.replaceAll('"', '""')}"`;
}

/** Lines of a file being written. */
export class TextBuilder {
  private readonly lines: string[] = [];

  /** A record the engine skips (`read (u,*)` with an empty list). */
  comment(text: string): this {
    this.lines.push(text.startsWith('*') ? text : `* ${text}`);
    return this;
  }

  /** A section header: a title between rules, then more skipped records. */
  section(number: number, title: string, ...comments: string[]): this {
    this.comment(RULE).comment(`*       ${number}. ${title}`).comment(RULE);
    for (const text of comments) this.comment(text);
    return this;
  }

  /** One record holding `tokens`. */
  record(...tokens: string[]): this {
    this.lines.push(tokens.join(' '));
    return this;
  }

  /** One record per row, columns aligned. */
  table(rows: readonly (readonly string[])[]): this {
    const widths: number[] = [];
    for (const row of rows) {
      row.forEach((token, k) => (widths[k] = Math.max(widths[k] ?? 0, token.length)));
    }
    for (const row of rows) {
      this.lines.push(
        row
          .map((token, k) => token.padEnd(widths[k]))
          .join('  ')
          .trimEnd(),
      );
    }
    return this;
  }

  text(): string {
    return `${this.lines.join('\n')}\n`;
  }
}

export const RULE = '*'.repeat(62);
