import { expect, test } from '@playwright/test';
import { ribChord, ribWashin } from '../../packages/geometry/src/index.ts';
import { DESIGNS, project } from '../format/helpers';
import { report, table } from './helpers';

test('rib chords, washins and betas match the rib properties of lep-out.txt', () => {
  for (const id of DESIGNS) {
    const { design } = project(`oracle/designs/${id}`);
    const rows = table(report(id), 'Rib - Chord - washin - beta', 5);
    expect(rows, id).toHaveLength(design.geometry.ribs.length);
    for (const [number, chord, washin, beta] of rows) {
      expect(ribChord(design, number - 1), `${id} rib ${number}`).toBeCloseTo(chord, 2);
      expect(ribWashin(design, number - 1), `${id} rib ${number}`).toBeCloseTo(washin, 3);
      expect(design.geometry.ribs[number - 1].beta, `${id} rib ${number}`).toBeCloseTo(beta, 2);
    }
  }
});

test('the washin of modes 1 and 2 divides by the central chord but on the last rib', () => {
  const { design } = project('oracle/designs/swoop2');
  const ribs = design.geometry.ribs;
  const chord = (i: number) => ribs[i].yTE - ribs[i].yLE;
  expect(design.geometry.washin).toMatchObject({ mode: 1, maxAngle: 5 });
  expect(ribWashin(design, 1)).toBeCloseTo((5 * (chord(0) - chord(1))) / chord(0), 10);
  expect(ribWashin(design, ribs.length - 1)).toBe(5);
});
