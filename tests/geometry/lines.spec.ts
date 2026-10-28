import { expect, test } from '@playwright/test';
import {
  brakeLines,
  suspensionLines,
  type SuspensionLine,
} from '../../packages/geometry/src/index.ts';
import { DESIGNS, project } from '../format/helpers';
import { report, table } from './helpers';

/**
 * Compares `computed` with the rows of the line matrix of lep-out.txt in
 * `plans`: geometric lengths, and centers unless `lengthsOnly`.
 */
function compare(
  id: string,
  computed: readonly SuspensionLine[],
  plans: (plan: number) => boolean,
  lengthsOnly: boolean,
) {
  const out = report(id);
  // Line, plan, level, order, …, `L =` (a word), its geometric length, …
  const matrix = out.flatMap((line) => {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+\d+){4}\s+L =\s+(\S+)/.exec(line);
    return m ? [m.slice(1).map(Number)] : [];
  });
  const centers = new Map(
    table(out, 'Line - Lenght - LenghtL', 8).map((row) => [row[0], row.slice(5)]),
  );
  const lines = new Map(computed.map((line) => [`${line.plan}/${line.level}/${line.order}`, line]));
  const rows = matrix.filter(([, plan]) => plans(plan));
  expect(lines.size, id).toBe(rows.length);
  for (const [number, plan, level, order, length] of rows) {
    const line = lines.get(`${plan}/${level}/${order}`)!;
    const name = `${id} line ${number}`;
    expect(line, name).toBeDefined();
    const ends = [0, 1, 2].map((axis) => [line.start[axis], line.end[axis]]);
    expect(Math.hypot(...ends.map(([a, b]) => b - a)), name).toBeCloseTo(length, 2);
    if (lengthsOnly) continue;
    ends.forEach(([a, b], axis) =>
      expect((a + b) / 2, name).toBeCloseTo(centers.get(number)![axis], 2),
    );
  }
}

test('suspension lines match the lengths and centers of the line matrix of lep-out.txt', () => {
  for (const id of DESIGNS) {
    const { design, airfoils } = project(`oracle/designs/${id}`);
    const count = design.lines.plans.length;
    // A single skin prints centers that are not its lines' (risers far from their karabiners).
    const single = design.geometry.paragliderType === 'ss';
    compare(id, suspensionLines(design, airfoils), (plan) => plan <= count, single);
  }
});

test('brake lines match the lengths and centers of the line matrix of lep-out.txt', () => {
  for (const id of DESIGNS) {
    const { design, airfoils } = project(`oracle/designs/${id}`);
    const count = design.lines.plans.length;
    compare(id, brakeLines(design, airfoils), (plan) => plan === count + 1, false);
  }
});
