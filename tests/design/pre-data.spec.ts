import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import {
  GENERATED_COLUMNS,
  SHAPE_DEFAULTS,
  SHAPE_LIMITS,
  applyGeometry,
  fitShape,
  fromShape,
  isGeneratedGeometry,
  newPreData,
  shapeOfRibs,
  type WingShape,
} from '../../packages/design/src/index.ts';
import { parseLep, validateDesign, type LepDesign } from '../../packages/format/src/index.ts';
import { PREPROCESSOR_EXAMPLE, generateGeometry } from '../../packages/preprocessor/src/index.ts';
import { lep } from '../format/helpers';
import { ok, withCells } from '../preprocessor/cases.ts';

const design = (): LepDesign => ok(parseLep(lep()));
/** `design` with a nine-column rib table. */
const nineColumns = (d: LepDesign): LepDesign => ({
  ...d,
  geometry: {
    ...d.geometry,
    ribColumns: 9,
    ribs: d.geometry.ribs.map(({ number, x, yLE, yTE, xp, z, beta, rotationPoint, washin }) => ({
      number,
      x,
      yLE,
      yTE,
      xp,
      z,
      beta,
      rotationPoint,
      washin,
    })),
  },
});
const sectionErrors = (d: LepDesign) =>
  validateDesign(d).filter((x) => x.section === 1 && x.severity === 'error');

test('applying replaces the generated columns only, and is recognized afterwards', () => {
  const d = design();
  const original = structuredClone(d);
  const result = ok(generateGeometry(withCells(d.geometry.cells)));
  const applied = applyGeometry(d, result);
  expect(d).toEqual(original);
  expect(applied.washin).toBe(d.geometry.washin);
  for (const [i, rib] of applied.ribs.entries()) {
    const { rotationPoint, washin, rotZ, rotZPosition } = d.geometry.ribs[i];
    expect(rib).toMatchObject({ rotationPoint, washin, rotZ, rotZPosition });
    // Rounded as geometry-out.txt (F7.2), which users copy into leparagliding.txt.
    for (const key of GENERATED_COLUMNS) {
      expect(rib[key]).toBeCloseTo(result.ribs[i][key], 2);
      expect(rib[key]).toBe(Number(rib[key].toFixed(2)));
    }
  }
  expect(isGeneratedGeometry({ geometry: applied }, result)).toBe(true);
  expect(isGeneratedGeometry(d, result)).toBe(false);
  const [first, ...rest] = applied.ribs;
  const shifted = { ...applied, ribs: [{ ...first, x: first.x + 0.01 }, ...rest] };
  expect(isGeneratedGeometry({ geometry: shifted }, result)).toBe(false);
});

test('new rows take the washin of the preprocessor, and rotations only in an 11-column table', () => {
  const result = ok(generateGeometry(withCells(52)));
  const eleven = design();
  expect(eleven.geometry.ribColumns).toBe(11);
  const larger = applyGeometry(eleven, result);
  expect(larger).toMatchObject({ cells: 52, ribCount: 53 });
  expect(larger.ribs).toHaveLength(27);
  expect(larger.ribs.at(-1)).toMatchObject({
    rotationPoint: 33.33,
    washin: 0,
    rotZ: 0,
    rotZPosition: 0,
  });
  expect(sectionErrors({ ...eleven, geometry: larger })).toEqual([]);

  const nine = nineColumns(design());
  const grown = applyGeometry(nine, result);
  expect(grown.ribs.at(-1)).not.toHaveProperty('rotZ');
  expect(grown.ribs.at(-1)).not.toHaveProperty('rotZPosition');
  expect(sectionErrors({ ...nine, geometry: grown })).toEqual([]);
});

test('fitting a rib table that a shape generates gives that shape back', () => {
  const shape = {
    ...SHAPE_DEFAULTS,
    leadingEdgeRoundness: 0.9,
    trailingEdgeRoundness: 0.5,
    leadingEdgeDrop: 0.15,
    leadingEdgeDropStart: 0.75,
    tipCurl: 0.25,
    centerArc: 0.35,
    cellUniformity: 0.4,
  };
  const generated = ok(generateGeometry(fromShape(shape, PREPROCESSOR_EXAMPLE)));
  const fitted = fitShape(SHAPE_DEFAULTS, { geometry: applyGeometry(design(), generated) });
  for (const key of Object.keys(SHAPE_LIMITS) as (keyof WingShape)[]) {
    const [min, max] = SHAPE_LIMITS[key];
    expect(Math.abs(fitted[key] - shape[key]), key).toBeLessThan(0.02 * (max - min));
  }
});

test('fitting the Swoop 2 table gives the leading edge of its pre-data.txt, and follows its vault', () => {
  const swoop = ok(parseLep(readFileSync('oracle/designs/swoop2/leparagliding.txt', 'utf8')));
  const fitted = fitShape(SHAPE_DEFAULTS, swoop);
  // Its pre-data.txt: a1 641.67, b1 182.31, x1 435.03, c01 17.44, ex1 2 for a half span of 618.5.
  expect(fitted.leadingEdgeRoundness).toBeCloseTo(0.964, 2);
  expect(fitted.leadingEdgeDrop).toBeCloseTo(0.115, 2);
  expect(fitted.leadingEdgeDropStart).toBeCloseTo(0.703, 2);
  const { ribs } = ok(generateGeometry(fromShape(fitted, PREPROCESSOR_EXAMPLE)));
  for (const [i, rib] of ribs.entries())
    expect(Math.abs(rib.yLE - swoop.geometry.ribs[i].yLE), `rib ${i + 1}`).toBeLessThan(0.5);
  // The official preprocessor drops a vault arc segment there (patch 001): with the patch, its
  // own arcs are 1.9 cm (rms) and 4.9 cm at the tip from its table.
  const vault = ribs.map((rib, i) => {
    const { xp, z } = swoop.geometry.ribs[i];
    return (rib.xp - xp) ** 2 + (rib.z - z) ** 2;
  });
  expect(Math.sqrt(vault.reduce((sum, d) => sum + d, 0) / vault.length)).toBeLessThan(1.2);
});

test('without its vault, fitting keeps the vault settings and fits the others', () => {
  const d = design();
  const applied = applyGeometry(d, ok(generateGeometry(withCells(44))));
  const ribs = applied.ribs.map((rib, i) => (i === 1 ? { ...rib, z: Number.NaN } : rib));
  const shape = { ...SHAPE_DEFAULTS, tipCurl: 0.5 };
  const fitted = fitShape(shape, { geometry: { ...applied, ribs } });
  expect(fitted).toEqual({
    ...fitShape(shape, { geometry: applied }),
    tipAngle: shapeOfRibs(ribs, 44).tipAngle,
    tipCurl: 0.5,
    centerArc: SHAPE_DEFAULTS.centerArc,
  });
  expect(fitted.leadingEdgeDrop).not.toBe(SHAPE_DEFAULTS.leadingEdgeDrop);
});

test('without a valid planform, fitting keeps the settings', () => {
  const { geometry } = design();
  const ribs = geometry.ribs.map((rib, i) => (i === 1 ? { ...rib, yLE: Number.NaN } : rib));
  expect(fitShape(SHAPE_DEFAULTS, { geometry: { ...geometry, ribs } })).toEqual(SHAPE_DEFAULTS);
});

test('a new pre-data.txt has the default shape and the wing name of section 1', () => {
  const shaped = fromShape(SHAPE_DEFAULTS, PREPROCESSOR_EXAMPLE);
  const named = (wingName: string) => {
    const d = design();
    return { geometry: { ...d.geometry, wingName } };
  };
  expect(newPreData(named(' Wing '))).toEqual({ ...shaped, name: 'Wing' });
  expect(newPreData(named(' '))).toEqual(shaped);
});
