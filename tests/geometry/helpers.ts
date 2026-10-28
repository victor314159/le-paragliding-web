import { readFileSync } from 'node:fs';

/** The lines of lep-out.txt, the engine's report, of an oracle design. */
export const report = (id: string) =>
  readFileSync(`oracle/reference/${id}/lep-out.txt`, 'latin1').split('\n');

/** The rows of numbers of a report after `title`, up to the first other line. */
export function table(lines: readonly string[], title: string, columns: number) {
  const rows: number[][] = [];
  for (const line of lines.slice(lines.findIndex((l) => l.includes(title)) + 1)) {
    const row = line.trim().split(/\s+/).map(Number);
    if (row.length === columns && row.every(Number.isFinite)) rows.push(row);
    else if (rows.length) break;
  }
  return rows;
}
