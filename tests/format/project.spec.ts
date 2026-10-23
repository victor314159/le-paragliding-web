import { expect, test } from '@playwright/test';
import { readProject, validate } from '../../packages/format/src/index.ts';
import { DESIGNS, designFiles } from './helpers';

const swoop2 = designFiles('oracle/designs/swoop2');
const main = swoop2.get('leparagliding.txt')!;
const foil = swoop2.get('gnuReflex.txt')!;
const errors = (diagnostics: readonly { severity: string }[]) =>
  diagnostics.filter((d) => d.severity === 'error');

test('the examples read into projects without errors', () => {
  for (const id of DESIGNS) {
    const reading = readProject(designFiles(`oracle/designs/${id}`));
    expect(reading.project, id).toBeDefined();
    expect(errors(reading.diagnostics), id).toEqual([]);
  }
});

test('missing files are reported, airfoils from the model references', () => {
  expect(readProject(new Map([['gnuReflex.txt', foil]])).diagnostics).toEqual([
    expect.objectContaining({ severity: 'error', message: 'Missing input file leparagliding.txt' }),
  ]);
  // Fortran repetition syntax names the airfoil too.
  const repeated = main.replaceAll('gnuReflex.txt', "1*'gnuReflex.txt'");
  const reading = readProject(new Map([['leparagliding.txt', repeated]]));
  expect(reading.project).toBeDefined();
  expect(reading.diagnostics).toContainEqual(
    expect.objectContaining({ severity: 'error', message: 'Missing airfoil gnuReflex.txt' }),
  );
});

test('an unreadable file reports its reading errors only', () => {
  const brokenMain = readProject(new Map([...swoop2, ['leparagliding.txt', 'broken']]));
  expect(brokenMain.project).toBeUndefined();
  expect(brokenMain.diagnostics).toContainEqual(
    expect.objectContaining({ severity: 'error', file: 'leparagliding.txt' }),
  );
  const brokenFoil = readProject(new Map([...swoop2, ['gnuReflex.txt', 'broken']]));
  expect(brokenFoil.project?.airfoils.has('gnuReflex.txt')).toBe(false);
  expect(brokenFoil.reading).toContainEqual(
    expect.objectContaining({ severity: 'error', file: 'gnuReflex.txt' }),
  );
  expect(brokenFoil.diagnostics).not.toContainEqual(
    expect.objectContaining({ message: 'Missing airfoil gnuReflex.txt' }),
  );
  // validate keeps this for a changed project, given the reading.
  const project = brokenFoil.project!;
  const changed = { ...project, design: { ...project.design, dxf2d: { mode: 0 } } } as const;
  expect(validate(changed, { reading: brokenFoil.reading })).toEqual(brokenFoil.diagnostics);
});

test('files the design does not name are not read', () => {
  const reading = readProject(new Map([...swoop2, ['notes.txt', 'notes']]));
  expect(reading.project?.airfoils.has('notes.txt')).toBe(false);
  expect(reading.diagnostics.filter((d) => d.file === 'notes.txt')).toEqual([]);
});
